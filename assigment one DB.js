
db.students.insertMany([
  {
    name: "Ayan Omar",
    age: 21,
    email: "ayan@gmail.com",
    courses: ["html", "css"]
  },
  {
    name: "Sara Ali",
    age: 23,
    email: "sara@gmail.com",
    courses: ["javascript", "nodejs"]
  },
  {
    name: "ahmed ali",
    age: 20,
    email: "ahmed@.com",
    courses: ["mongodb"]
  }
])


db.students.find()


db.students.find().pretty()

db.students.updateOne(
  { name: "Ayan Omar" },
  { $set: { email: "ayan.new@gmail.com" } }
)
db.students.deleteOne({ name: "ahmed ali" })

db.students.insertOne({
  name: "Farahan mawlid",
  age: 22,
  email: "farahan@gmail.com",
  courses: ["python"],
  address: {
    city: "jigjiga",
    country: "Somali galbed"
  }
})