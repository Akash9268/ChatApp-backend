import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

//middleware
io.use((socket, next) => {
  const username = socket.handshake.auth.username;
  if (!username) {
    return next(new Error("Invalid Username"));
  }

  socket.username = username;
  //   socket.userId = uuidv4();
  next();
});

//connecting to server
io.on("connection", (socket) => {
  console.log("connection Established", socket.id);
  //connecting to the users
  console.log(socket.username);
  socket.emit("session", { userId: socket.userId, username: socket.username });
});

console.log("Listening to port....");
//if not running from terminal it chooses 4000
const port = process.env.PORT || 4000;
httpServer.listen(port, () => console.log(`listening on port ${port}`));