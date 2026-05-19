import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.ORDERS_TABLE || "Orders";
const USER_INDEX = process.env.USER_INDEX || "userId-index"; // GSI name

export const handler = async (event) => {
  try {
    const orderId = event.pathParameters?.orderId;
    const userId = event.queryStringParameters?.userId;

    // --- GET /orders/{orderId} — fetch a single order ---
    if (orderId) {
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { orderId },
        })
      );

      if (!result.Item) {
        return response(404, { error: `Order '${orderId}' not found.` });
      }

      return response(200, { order: result.Item });
    }

    // --- GET /orders?userId=xxx — fetch all orders for a user ---
    if (userId) {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: USER_INDEX,
          KeyConditionExpression: "userId = :uid",
          ExpressionAttributeValues: { ":uid": userId },
          // Newest orders first
          ScanIndexForward: false,
        })
      );

      return response(200, {
        orders: result.Items || [],
        count: result.Count || 0,
      });
    }

    // --- Neither param provided ---
    return response(400, {
      error: "Provide either a path parameter {orderId} or query param ?userId=",
    });
  } catch (error) {
    console.error("getOrder error:", error);
    return response(500, { error: "Internal server error." });
  }
};

// --- Helper ---
const response = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
