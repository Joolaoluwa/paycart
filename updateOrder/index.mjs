import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.ORDERS_TABLE || "Orders";

const VALID_STATUSES = ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"];

export const handler = async (event) => {
  try {
    const orderId = event.pathParameters?.orderId;

    if (!orderId) {
      return response(400, { error: "orderId path parameter is required." });
    }

    const body = JSON.parse(event.body || "{}");
    const { status, items, totalAmount } = body;

    // --- At least one updatable field must be provided ---
    if (!status && !items && totalAmount === undefined) {
      return response(400, {
        error: "Provide at least one field to update: status, items, or totalAmount.",
      });
    }

    // --- Validate status if provided ---
    if (status && !VALID_STATUSES.includes(status)) {
      return response(400, {
        error: `Invalid status. Allowed values: ${VALID_STATUSES.join(", ")}`,
      });
    }

    // --- Build update expression dynamically ---
    const expressionParts = [];
    const expressionNames = {};
    const expressionValues = {
      ":updatedAt": new Date().toISOString(),
    };

    // updatedAt is always set
    expressionParts.push("#updatedAt = :updatedAt");
    expressionNames["#updatedAt"] = "updatedAt";

    if (status) {
      expressionParts.push("#status = :status");
      expressionNames["#status"] = "status"; // 'status' is a reserved word in DynamoDB
      expressionValues[":status"] = status;
    }

    if (items) {
      if (!Array.isArray(items) || items.length === 0) {
        return response(400, { error: "items must be a non-empty array." });
      }
      expressionParts.push("#items = :items");
      expressionNames["#items"] = "items";
      expressionValues[":items"] = items;
    }

    if (totalAmount !== undefined) {
      if (typeof totalAmount !== "number" || totalAmount <= 0) {
        return response(400, { error: "totalAmount must be a positive number." });
      }
      expressionParts.push("#totalAmount = :totalAmount");
      expressionNames["#totalAmount"] = "totalAmount";
      expressionValues[":totalAmount"] = totalAmount;
    }

    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { orderId },
        UpdateExpression: `SET ${expressionParts.join(", ")}`,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
        // Ensure the order exists before updating
        ConditionExpression: "attribute_exists(orderId)",
        ReturnValues: "ALL_NEW",
      })
    );

    return response(200, {
      message: "Order updated successfully.",
      order: result.Attributes,
    });
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      return response(404, { error: "Order not found." });
    }
    console.error("updateOrder error:", error);
    return response(500, { error: "Internal server error." });
  }
};

// --- Helper ---
const response = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
