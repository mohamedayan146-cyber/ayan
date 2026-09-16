import { useState } from "react";

const StudentRegistration = () => {
  const [formData, setFormData] = useState({
    studentName: "duniy ahmed ali",
    email: "dnuiya@gmail.com",
    grade: "",
    subjects: [],
  });

  const [touched, setTouched] = useState({});

  const subjectsList = ["physics", "Biology", "English"];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleBlur = (e) => {
    setTouched((prev) => ({ ...prev, [e.target.name]: true }));
  };

  const handleSubjectToggle = (subject) => {
    setFormData((prev) => ({
      ...prev,
      subjects: prev.subjects.includes(subject)
        ? prev.subjects.filter((s) => s !== subject)
        : [...prev.subjects, subject],
    }));
    setTouched((prev) => ({ ...prev, subjects: true }));
  };

  const errors = {
    studentName: formData.studentName.trim() === "" ? "Name is required" : "",
    email: formData.email.trim() === "" ? "Email is required" : "",
    grade: formData.grade === "" ? "Please select a grade" : "",
    subjects: formData.subjects.length === 0 ? "Select at least one subject" : "",
  };

  const isFormValid = Object.values(errors).every((err) => err === "");

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched({
      studentName: true,
      email: true,
      grade: true,
      subjects: true,
    });
    if (isFormValid) {
      console.log("Registered:", formData);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center p-8">
      <div className="bg-white shadow-md rounded-2xl p-10 w-full max-w-xl">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">
          Student Registration
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-gray-700 font-medium mb-2">Student Name</label>
            <input
              type="text"
              name="studentName"
              value={formData.studentName}
              onChange={handleChange}
              onBlur={handleBlur}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            {touched.studentName && errors.studentName && (
              <p className="text-red-500 text-sm mt-1">{errors.studentName}</p>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              onBlur={handleBlur}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            {touched.email && errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">Grade Level</label>
            <select
              name="grade"
              value={formData.grade}
              onChange={handleChange}
              onBlur={handleBlur}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              <option value="">Select Grade</option>
              <option value="9">Grade 9</option>
              <option value="10">Grade 10</option>
              <option value="11">Grade 11</option>
              <option value="12">Grade 12</option>
            </select>
            {touched.grade && errors.grade && (
              <p className="text-red-500 text-sm mt-1">{errors.grade}</p>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-3">Subjects Interest</label>
            <div className="space-y-2">
              {subjectsList.map((subject) => (
                <label key={subject} className="flex items-center gap-2 text-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.subjects.includes(subject)}
                    onChange={() => handleSubjectToggle(subject)}
                    className="w-4 h-4 accent-red-500"
                  />
                  {subject}
                </label>
              ))}
            </div>
            {touched.subjects && errors.subjects && (
              <p className="text-red-500 text-sm mt-1">{errors.subjects}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Register
          </button>
        </form>
      </div>
    </div>
  );
};

export default StudentRegistration;