import { useState } from "react";

const DeveloperApplicationForm = () => {
  const [formData, setFormData] = useState({
    fullName: "alma abdi ali",
    email: "alma@gmail.com",
    role: "addmin",
    experience: "devlpoer",
    skills: [],
    agreeTerms: false,
    receiveNotifications: false,
  });

  const skillsList = [
    "React", "JavaScript", "TypeScript", "Node.js",
    "Python", "Java", "UI Design", "API Development",
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSkillToggle = (skill) => {
    setFormData((prev) => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter((s) => s !== skill)
        : [...prev.skills, skill],
    }));
  };

  const handleCheckbox = (e) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log(formData);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center p-8">
      <div className="bg-white shadow-md rounded-2xl p-10 w-full max-w-xl">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">
          Developer Application Form
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-gray-700 font-medium mb-2">Full Name</label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">Role</label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              <option value="">Select a role</option>
              <option value="frontend">Frontend Developer</option>
              <option value="backend">Backend Developer</option>
              <option value="fullstack">Full Stack Developer</option>
              <option value="designer">UI/UX Designer</option>
            </select>
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">Years of Experience</label>
            <input
              type="number"
              name="experience"
              value={formData.experience}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-3">Skills</label>
            <div className="grid grid-cols-2 gap-3">
              {skillsList.map((skill) => (
                <label key={skill} className="flex items-center gap-2 text-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.skills.includes(skill)}
                    onChange={() => handleSkillToggle(skill)}
                    className="w-4 h-4 accent-red-500"
                  />
                  {skill}
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-gray-700">
            <input
              type="checkbox"
              name="agreeTerms"
              checked={formData.agreeTerms}
              onChange={handleCheckbox}
              className="w-4 h-4 accent-red-500"
            />
            I agree to the terms and conditions
          </label>

          <label className="flex items-center gap-2 text-gray-600">
            <input
              type="checkbox"
              name="receiveNotifications"
              checked={formData.receiveNotifications}
              onChange={handleCheckbox}
              className="w-4 h-4 accent-red-400"
            />
            Receive notifications about new opportunities
          </label>

          <button
            type="submit"
            className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-lg transition"
          >
            Submit Application
          </button>
        </form>
      </div>
    </div>
  );
};

export default DeveloperApplicationForm;