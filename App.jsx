import UserList from "./UserList";

const App = () => {
  const users = [
    { id: 1, name: "duniya", email: "duniya@com" },
    { id: 2, name: "ali", email: "ali@gmail.com" },
    { id: 3, name: "fatma", email: "fatma@gmail.com" },
  ];

  return (
    <div>
      <h1>User List</h1>
      <UserList users={users} />
    </div>
  );
};

export default App;