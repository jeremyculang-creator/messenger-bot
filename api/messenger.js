const Groq = require("groq-sdk");

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const groq = new Groq({ apiKey: GROQ_API_KEY });

async function getAIReply(userMessage) {
  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: userMessage }],
    model: "llama-3.3-70b-versatile",
  });
  return completion.choices[0].message.content;
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

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (req.query.debug === "1") {
      let aiStatus = "untested";
      try {
        const reply = await getAIReply("Say hi in one word");
        aiStatus = "OK: " + reply.substring(0, 50);
      } catch (err) {
        aiStatus = "FAIL: " + err.message;
      }
      return res.json({
        hasPageToken: !!PAGE_ACCESS_TOKEN,
        hasVerifyToken: !!VERIFY_TOKEN,
        hasGroqKey: !!GROQ_API_KEY,
        aiStatus,
      });
    }

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  if (req.method === "POST") {
    try {
      const body = req.body;

      if (body.object === "page") {
        for (const entry of body.entry) {
          if (!entry.messaging || !entry.messaging.length) continue;

          const webhookEvent = entry.messaging[0];
          const senderId = webhookEvent.sender.id;

          if (webhookEvent.message && webhookEvent.message.text) {
            const userMessage = webhookEvent.message.text;
            try {
              const reply = await getAIReply(userMessage);
              await sendMessage(senderId, reply);
            } catch (err) {
              console.error("AI/Send error:", err.message);
              await sendMessage(senderId, "Ay sorry, may error ako ngayon. Try ulit later! 😅");
            }
          }
        }
        return res.status(200).send("EVENT_RECEIVED");
      }
      return res.status(404).send("Not Found");
    } catch (err) {
      console.error("Parse error:", err.message);
      return res.status(200).send("EVENT_RECEIVED");
    }
  }

  return res.status(405).send("Method Not Allowed");
};
