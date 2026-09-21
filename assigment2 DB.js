
db.students.find({ age: { $gt: 22 } })

db.students.find({ courses: "React" })

db.students.find({ name: { $regex: "^S" } })


db.students.find({ age: { $in: [18, 21] } })

db.students.find({ email: { $not: { $regex: "gmail.com" } } })


db.students.find({
  courses: "React",
  age: { $gt: 20 }
})

db.students.find({
  courses: { $in: ["React", "Node.js"] }
})

db.students.find({
  $or: [
    { name: { $regex: "ardo", $options: "i" } },
    { email: { $regex: "\\.edu$" } }
  ]
})