import { User } from "../models/User.js";

const MAX_USERNAME_LENGTH = 30;
const MAX_DISPLAY_NAME_LENGTH = 60;

/* =========================
   SET USERNAME
========================= */
export async function setUsername(req, res) {
  try {
    let { username, display_name } = req.body;

    if (!username) return res.status(400).json({ error: "Username required" });

    username = username.trim().toLowerCase();
    display_name = display_name ? display_name.trim() : null;

    if (username.length < 3)
      return res.status(400).json({ error: "Username must be at least 3 characters" });

    if (username.length > MAX_USERNAME_LENGTH)
      return res.status(400).json({ error: `Username must be at most ${MAX_USERNAME_LENGTH} characters` });

    if (!/^[a-z0-9_]+$/.test(username))
      return res.status(400).json({ error: "Username may only contain letters, numbers, and underscores" });

    if (display_name && display_name.length > MAX_DISPLAY_NAME_LENGTH)
      return res.status(400).json({ error: `Display name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters` });

    // Check if username is taken by another user
    const existing = await User.findOne({
      username,
      _id: { $ne: req.user.id },
    });
    if (existing) return res.status(409).json({ error: "Username is already taken" });

    await User.findByIdAndUpdate(req.user.id, { username, display_name });

    res.json({ message: "Profile updated", username, display_name });
  } catch (err) {
    console.error("setUsername error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

/* =========================
   SEARCH USERS
========================= */
export async function searchUsers(req, res) {
  try {
    const { username } = req.query;

    if (!username || username.trim().length < 2) return res.json([]);

    const query = username.trim().toLowerCase();

    const users = await User.find({
      username: { $regex: query, $options: "i" },
      _id: { $ne: req.user.id },
    })
      .select("username display_name")
      .limit(10);

    res.json(users.map((u) => ({ id: u._id, username: u.username, display_name: u.display_name })));
  } catch (err) {
    console.error("searchUsers error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
