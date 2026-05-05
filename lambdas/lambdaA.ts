import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  QueryCommandInput,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";

const client = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
  try {
    console.log("Event: ", JSON.stringify(event));

    const cinemaId = event.pathParameters?.cinemaId;
    const movieId = event.queryStringParameters?.movieId;

    if (!cinemaId) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Missing cinemaId path parameter" }),
      };
    }

    // If movieId is provided: 


    // Returning only the screen number for that movie
    if (movieId) {
      const getResult = await client.send(
        new GetCommand({
          TableName: process.env.TABLE_NAME,
          Key: {
            pk: `s#${cinemaId}`,
            sk: `s#${movieId}`,
          },
        })
      );

      if (!getResult.Item) {
        return {
          statusCode: 404,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: `No screening found for movie ${movieId} in cinema ${cinemaId}`,
          }),
        };
      }

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ screenNo: getResult.Item.screenNo }),
      };
    }

    // If movieId is not provided: 
    
    // Return all schedules for the cinema
    const queryParams: QueryCommandInput = {
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: {
        ":pk": `s#${cinemaId}`,
        ":sk": "s#",
      },
    };

    const queryResult = await client.send(new QueryCommand(queryParams));

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: queryResult.Items }),
    };
  } catch (error: any) {
    console.log(JSON.stringify(error));
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
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