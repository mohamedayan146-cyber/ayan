
enum UserRole {
  SuperAdmin = "superadmin",
  Moderator = "moderator",
  Viewer = "viewer",
}

function canEdit(role: UserRole): boolean {
  return role !== UserRole.Viewer;
}

console.log(canEdit(UserRole.SuperAdmin));
console.log(canEdit(UserRole.Moderator)); 
console.log(canEdit(UserRole.Viewer));     

const button = document.querySelector("button") as HTMLButtonElement;
button.disabled = true;