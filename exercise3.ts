
function fullName(first: string, last: string): string {
  return first + " " + last;
}

console.log(fullName("alma", "ali"));

function registerUser(
  username: string,
  isAdmin?: boolean,
  language: string = "en"
): void {
  console.log({
    username,
    isAdmin,
    language,
  });
}                   
registerUser("duniya eng", true);              
registerUser("alma", false, "ah");          

function average(...scores: number[]): number {
  if (scores.length === 0) return 0;
  const total = scores.reduce((sum, score) => sum + score, 0);
  return total / scores.length;
}

console.log(average(50, 80, 40));           
console.log(average(60, 75, 85, 95));         
console.log(average(10, 20, 88, 50, 65));   