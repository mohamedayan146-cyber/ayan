db.students.insertMany([
  {
    name: "Ayan abdi",
    email: "ayan@gmail.com",
    points: 10,
    courses: ["html", "css"]
  },
  {
    name: "Sundus Ali",
    email: "sundus@gmail.com",
    points: 15,
    courses: ["javascript"]
  },
  {
    name: "kadra omer",
    email: "kadra@gmail.com",
    points: 5,
    courses: ["mongodb", "nodejs"]
  }
])

// 2. Use $set to update one email
db.students.updateOne(
  { name: "Asma farah" },
  { $set: { email: "asma.new@gmail.com" } }
)

// 3. Use $inc to increase points
db.students.updateOne(
  { name: "asma farah" },
  { $inc: { points: 5 } }
)

// 4. Use $push to add a new course
db.students.updateOne(
  { name: "Kadar" },
  { $push: { courses: "react" } }
)

// 5. Use $pull to remove a course
db.students.updateOne(
  { name: "ahmed" },
  { $pull: { courses: "nodejs" } }
)

// 6. BONUS: update one student with $set, $inc, and $push together
db.students.updateOne(
  { name: "Sara Ali" },
  {
    $set: { email: "sumaya.updated@gmail.com" },
    $inc: { points: 10 },
    $push: { courses: "react" }
  }
)
{
  acknowledged: true,
  insertedId: null,
  matchedCount: 0,
  modifiedCount: 0,
  upsertedCount: 0
}
test


