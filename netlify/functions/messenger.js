const { GoogleGenerativeAI } = require("@google/generative-ai");

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function getGeminiReply(userMessage) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const result = await model.generateContent(userMessage);
  return result.response.text();
}

async function sendMessage(recipientId, messageText) {
  const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: messageText.substring(0, 2000) },
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error("Facebook API error:", JSON.stringify(data));
  }
  return data;
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};

  // Debug endpoint: /.netlify/functions/messenger?debug=1
  if (event.httpMethod === "GET" && params.debug === "1") {
    let geminiStatus = "untested";
    try {
      const reply = await getGeminiReply("Say hi in one word");
      geminiStatus = "OK: " + reply.substring(0, 50);
    } catch (err) {
      geminiStatus = "FAIL: " + err.message;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        hasPageToken: !!PAGE_ACCESS_TOKEN,
        pageTokenPrefix: PAGE_ACCESS_TOKEN ? PAGE_ACCESS_TOKEN.substring(0, 10) + "..." : "MISSING",
        hasVerifyToken: !!VERIFY_TOKEN,
        hasGeminiKey: !!GEMINI_API_KEY,
        geminiStatus,
      }, null, 2),
    };
  }

  if (event.httpMethod === "GET") {
    const mode = params["hub.mode"];
    const token = params["hub.verify_token"];
    const challenge = params["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return { statusCode: 200, body: challenge };
    }
    return { statusCode: 403, body: "Forbidden" };
  }

  if (event.httpMethod === "POST") {
    try {
      const body = JSON.parse(event.body);

      if (body.object === "page") {
        for (const entry of body.entry) {
          if (!entry.messaging || !entry.messaging.length) continue;

          const webhookEvent = entry.messaging[0];
          const senderId = webhookEvent.sender.id;

          if (webhookEvent.message && webhookEvent.message.text) {
            const userMessage = webhookEvent.message.text;
            try {
              const reply = await getGeminiReply(userMessage);
              await sendMessage(senderId, reply);
            } catch (err) {
              console.error("Gemini/Send error:", err.message);
              await sendMessage(senderId, "Ay sorry, may error ako ngayon. Try ulit later! 😅");
            }
          }
        }
        return { statusCode: 200, body: "EVENT_RECEIVED" };
      }
      return { statusCode: 404, body: "Not Found" };
    } catch (err) {
      console.error("Parse error:", err.message);
      return { statusCode: 200, body: "EVENT_RECEIVED" };
    }
  }

  return { statusCode: 405, body: "Method Not Allowed" };
};
