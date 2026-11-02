const path = require("path");
const express = require("express");
const ejs = require("ejs");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const port = Number(process.env.PORT) || 3000;
const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const sessionSecret = process.env.SESSION_SECRET || "my-secret-key";

app.engine("html", ejs.renderFile);
app.set("view engine", "html");
app.set("views", path.join(__dirname, "templates"));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "templates", "static")));
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true }
}));

const client = new MongoClient(mongoUri);

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  next();
}

function validObjectId(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

app.get("/", (req, res) => res.redirect("/login"));

app.route("/register")
  .get((req, res) => res.render("register"))
  .post(async (req, res) => {
    const { username, email, password } = req.body;
    const existingUser = await users.findOne({ email });

    if (existingUser) {
      return res.status(409).send("Email already registered!");
    }

    await users.insertOne({
      username,
      email,
      password: await bcrypt.hash(password, 10)
    });

    res.redirect("/login");
  });

app.route("/login")
  .get((req, res) => res.render("login"))
  .post(async (req, res) => {
    const { email, password } = req.body;
    const user = await users.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).send("Invalid email or password!");
    }

    req.session.userId = user._id.toString();
    req.session.username = user.username;
    res.redirect("/dashboard");
  });

app.get("/dashboard", requireLogin, async (req, res) => {
  const myTasks = await tasks.find({ userId: req.session.userId }).toArray();
  res.render("dashboard", {
    tasks: myTasks,
    username: req.session.username
  });
});

app.post("/add", requireLogin, async (req, res) => {
  const { title, description } = req.body;

  await tasks.insertOne({
    userId: req.session.userId,
    title,
    description,
    status: "Pending"
  });

  res.redirect("/dashboard");
});

app.get("/complete/:taskId", requireLogin, async (req, res) => {
  const taskId = validObjectId(req.params.taskId);

  if (taskId) {
    await tasks.updateOne(
      { _id: taskId, userId: req.session.userId },
      { $set: { status: "Completed" } }
    );
  }

  res.redirect("/dashboard");
});

app.get("/delete/:taskId", requireLogin, async (req, res) => {
  const taskId = validObjectId(req.params.taskId);

  if (taskId) {
    await tasks.deleteOne({ _id: taskId, userId: req.session.userId });
  }

  res.redirect("/dashboard");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

let users;
let tasks;

async function start() {
  await client.connect();
  const db = client.db("todo_app");
  users = db.collection("users");
  tasks = db.collection("tasks");

  app.listen(port, () => {
    console.log(`Todo app listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Unable to connect to MongoDB:", error.message);
  process.exitCode = 1;
});