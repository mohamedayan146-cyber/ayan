

interface User {
  readonly id: number;
  username: string;
  password: string;
  email?: string;
}

function login(user: User): void {
  console.log(`Logging in ${user.username}`);
  if (user.email) {
    console.log(`Email: ${user.email}`);
  }
}

const user1: User = { id: 1, username: "duniya", password: "secret123" };
const user2: User = {
  id: 2,
  username: "alma",
  password: "omar4",
  email: "alma@example.com",
};

login(user1); 
login(user2); 

user1.id = 12; 