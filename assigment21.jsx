const Dashboard = () => {
  const stats = [
    { icon: "📊", label: "Average Grade", value: "90%" },
    { icon: "📚", label: "Courses", value: "5" },
    { icon: "⏰", label: "Study Hours", value: "22h" },
    { icon: "📝", label: "Assignments", value: "10" },
  ];

  const courses = [
    { name: "React Fundamentals", progress: 55, next: "Components & Props", instructor: "Sarah Wilson" },
    { name: "JavaScript Advanced", progress: 85, next: "Async/Await", instructor: "Mike Johnson" },
    { name: "UI/UX Design", progress: 80, next: "Color Theory", instructor: "Emily Chen" },
  ];

  const assignments = [
    { title: "Build a Todo App", course: "React Fundamentals", status: "pending", due: "2024-03-20" },
    { title: "API Integration", course: "JavaScript Advanced", status: "completed", due: "2024-03-18" },
    { title: "Design System", course: "UI/UX Design", status: "in-progress", due: "2024-03-25" },
  ];

  const announcements = [
    { title: "New Course Available", text: "Check out our new TypeScript course!", time: "2 hours ago" },
    { title: "Maintenance Notice", text: "Platform updates scheduled for tonight", time: "5 hours ago" },
  ];
  const statusStyles = {
    pending: "bg-red-100 text-red-600",
    completed: "bg-green-100 text-green-600",
    "in-progress": "bg-yellow-100 text-yellow-600",
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Welcome back, Student!</h1>
        <p className="text-gray-500 mt-1">Here's what's happening with your courses today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl shadow-sm p-6 flex items-center gap-4">
            <span className="text-3xl">{stat.icon}</span>
            <div>
              <p className="text-gray-500 text-sm">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-700">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Course Progress */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Course Progress</h2>
          <div className="space-y-6">
            {courses.map((course) => (
              <div key={course.name}>
                <div className="flex justify-between items-center mb-1">
                  <h3 className="font-semibold text-gray-800">{course.name}</h3>
                  <span className="text-gray-600 font-medium">{course.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className="bg-indigo-500 h-2 rounded-full"
                    style={{ width: `${course.progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Next: {course.next}</span>
                  <span>{course.instructor}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-8">
          {/* Upcoming Assignments */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Upcoming Assignments</h2>
            <div className="space-y-4">
              {assignments.map((a) => (
                <div key={a.title} className="flex justify-between items-start border-b border-gray-100 pb-3 last:border-0">
                  <div>
                    <p className="font-semibold text-gray-800">{a.title}</p>
                    <p className="text-sm text-gray-500">{a.course}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusStyles[a.status]}`}>
                      {a.status}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">Due {a.due}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Announcements */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Announcements</h2>
            <div className="space-y-3">
              {announcements.map((n) => (
                <div key={n.title} className="border-l-4 border-indigo-400 pl-4">
                  <p className="font-semibold text-gray-700">{n.title}</p>
                  <p className="text-sm text-gray-600">{n.text}</p>
                  <p className="text-xs text-gray-400 mt-1">{n.time}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;