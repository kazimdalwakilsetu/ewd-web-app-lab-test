import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  QueryCommandInput,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { Schedule, DBSchedule } from "../shared/types";
import {
  CookieMap,
  JwtToken,
  parseCookies,
  verifyToken,
} from "./utils";

const client = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (
  event: any,
  context
) => {
  try {
    console.log("Event: ", JSON.stringify(event));

    // Verifying the authenticated usr and is the user is 'admin'
    const cookies: CookieMap = parseCookies(event);

    if (!cookies || !cookies.token) {
      return {
        statusCode: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Unauthorized. No token provided." }),
      };
    }

    const verifiedJwt: JwtToken = await verifyToken(
      cookies.token,
      process.env.USER_POOL_ID,
      process.env.REGION!
    );

    if (!verifiedJwt) {
      return {
        statusCode: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Unauthorized. Invalid token." }),
      };
    }

    const username = (verifiedJwt as any)["cognito:username"];

    if (username !== "admin") {
      return {
        statusCode: 403,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "Forbidden. Only admin can add schedules.",
        }),
      };
    }

    // Body parsing
    const body = event.body ? JSON.parse(event.body) : undefined;

    if (!body || !body.cinemaId || !body.movieId || !body.screenNo) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Missing required fields in request body." }),
      };
    }

    const schedule: Schedule = {
      cinemaId: body.cinemaId,
      movieId: body.movieId,
      screenNo: body.screenNo,
    };

    // Already existence for the same cinema + screen


    const checkParams: QueryCommandInput = {
      TableName: process.env.TABLE_NAME,
      IndexName: "screenIx",
      KeyConditionExpression: "pk = :pk AND screenNo = :screenNo",
      ExpressionAttributeValues: {
        ":pk": `s#${schedule.cinemaId}`,
        ":screenNo": schedule.screenNo,
      },
    };

    const existingSchedule = await client.send(new QueryCommand(checkParams));

    if (existingSchedule.Items && existingSchedule.Items.length > 0) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: `Screen ${schedule.screenNo} in cinema ${schedule.cinemaId} is already scheduled. Overwrites are not allowed.`,
        }),
      };
    }

    // Writing the new schedule to DynamoDB
    const dbSchedule: DBSchedule = {
      pk: `s#${schedule.cinemaId}`,
      sk: `s#${schedule.movieId}`,
      screenNo: schedule.screenNo,
    };
    await client.send(
      new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: {
          ...dbSchedule,
        },
      })
    );
    return {
      statusCode: 201,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Saved to database",
        schedule: dbSchedule,
      }),
    };
  } catch (error: any) {
    console.log(JSON.stringify(error));
    return {
      statusCode: 500,
      headers: { 
        "content-type": "application/json",
      },
      body: JSON.stringify({ error }),
    };
  }
};

function createDDbDocClient() {
  const ddbClient = new DynamoDBClient({ region: process.env.REGION });
  const marshallOptions = {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  };
  const unmarshallOptions = {
    wrapNumbers: false,
  };
  const translateConfig = { marshallOptions, unmarshallOptions };
  return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}
