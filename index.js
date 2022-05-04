import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { saveSession, findSession, findAllSessions } from "./sessionStorage.js";
import { saveMessage, findMessagesForUser } from "./messageStorage.js";

import {
  privateDecrypt,
  constants,
  publicEncrypt,
  generateKeyPairSync,
} from "crypto";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

//middleware
io.use((socket, next) => {
  const sessionId = socket.handshake.auth.sessionId;
  if (sessionId) {
    // find my session
    const session = findSession(sessionId);
    if (session) {
      socket.sessionId = sessionId;
      socket.userId = session.userId;
      socket.username = session.username;
      return next();
    } else {
      return next(new Error("Invalid Session!"));
    }
  }

  const username = socket.handshake.auth.username;
  if (!username) {
    return next(new Error("Invalid Username"));
  }

  socket.username = username;
  socket.userId = uuidv4();
  socket.sessionId = uuidv4();
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  socket.privateKey = privateKey;
  socket.publicKey = publicKey;
  //key pair generate
  next();
});

function getMessagesForUser(userId) {
  const messagesPerUser = new Map();
  findMessagesForUser(userId).forEach((message) => {
    const { from, to } = message;
    const otherUser = userId === from ? to : from;
    if (messagesPerUser.has(otherUser)) {
      messagesPerUser.get(otherUser).push(message);
    } else {
      messagesPerUser.set(otherUser, [message]);
    }
  });

  return messagesPerUser;
}

//connecting to server
io.on("connection", (socket) => {
  console.log("connection Established", socket.id);
  console.log(socket.publicKey);

  saveSession(socket.sessionId, {
    userId: socket.userId,
    userPbKey: socket.publicKey,
    username: socket.username,
    connected: true,
  });

  socket.join(socket.userId);
  //all connected users
  const users = [];
  const usermessages = getMessagesForUser(socket.userId);
  findAllSessions().forEach((session) => {
    if (session.userId !== socket.userId) {
      users.push({
        userId: session.userId,
        userPublicKey: session.userPbKey,
        username: session.username,
        connected: session.connected,
        messages: usermessages.get(session.userId) || [],
      });
    }
  });

  //all users event
  socket.emit("users", users);

  //connecting to the users
  socket.emit("session", {
    sessionId: socket.sessionId,
    userId: socket.userId,
    username: socket.username,
  });

  //new user event
  socket.broadcast.emit("user connected", {
    userId: socket.userId,
    username: socket.username,
  });

  //new message event
  socket.on("private message", ({ content, to }) => {
    const newMessage = {
      from: socket.userId,
      to,
      content,
    };
    socket.to(to).emit("private message", newMessage);
    saveMessage(newMessage);
  });

  socket.on("user messages", ({ userId, username }) => {
    const userMessages = getMessagesForUser(userId);
    socket.emit("user message", {
      userId,
      username,
      messages: userMessages.get(socket.userId) || [],
    });
  });

  socket.on("disconnect", async () => {
    //returns a promise so we await
    const matchingSocket = await io.in(socket.userId).allSockets();
    const isDisconnected = matchingSocket.size === 0;
    if (isDisconnected) {
      //notify other users
      socket.broadcast.emit("user disconnected", {
        userId: socket.userId,
        username: socket.username,
      });

      //update the session
      saveSession(socket.sessionId, {
        userId: socket.userId,
        username: socket.username,
        connected: socket.connected,
      });
    }

    //notify other users
    //update the session
  });
});

console.log("Listening to port....");
//if not running from terminal it chooses 4000
const port = process.env.PORT || 4000;
httpServer.listen(port, () => console.log(`listening on port ${port}`));
