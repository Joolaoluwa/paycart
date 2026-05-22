import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.ORDERS_TABLE || "Orders";

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { userId, items, totalAmount } = body;

    // --- Validation ---
    if (!userId || !items || !Array.isArray(items) || items.length === 0) {
      return response(400, {
        error: "userId and a non-empty items array are required.",
      });
    }

    if (typeof totalAmount !== "number" || totalAmount <= 0) {
      return response(400, { error: "totalAmount must be a positive number." });
    }

    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity < 1) {
        return response(400, {
          error: "Each item must have a productId and a quantity of at least 1.",
        });
      }
    }

    // --- Build order ---
    const order = {
      orderId: randomUUID(),
      userId,
      items,
      totalAmount,
      status: "PENDING",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: order,
        // Prevent accidental overwrite if UUID collides (extremely unlikely)
        ConditionExpression: "attribute_not_exists(orderId)",
      })
    );

    return response(201, { message: "Order created successfully.", order });
  } catch (error) {
    console.error("createOrder error:", error);
    return response(500, { error: "Internal server error." });
  }
};

// --- Helper ---
const response = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
