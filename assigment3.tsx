"use server";

export interface FormState {
  success: boolean;
  message: string;
  errors: { password?: string };
}

export async function submitForm(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const firstName = String(formData.get("firstName") ?? "");
  const lastName = String(formData.get("lastName") ?? "");

  if (password.length < 6) {
    return {
      success: false,
      message: "",
      errors: { password: "Password must be at least 6 characters." },
    };
  }


  console.log("Email received:", email);

  return {
    success: true,
    message: `Hello, ${firstName} ${lastName}!`,
    errors: {},
  };
}
"use client";

import { useActionState } from "react";
import { submitForm, type FormState } from "./actions";

const initialState: FormState = { success: false, message: "", errors: {} };

export default function Home() {
  const [state, formAction, pending] = useActionState(submitForm, initialState);

  return (
    <main style={{ maxWidth: 400, margin: "40px auto" }}>
      <h1>Server Actions and Forms</h1>

      <form action={formAction} style={{ display: "grid", gap: 12 }}>
        {/* Exercise 3 */}
        <input name="firstName" placeholder="First name" required />
        <input name="lastName" placeholder="Last name" required />

        {/* Exercise 1 */}
        <input name="email" type="email" placeholder="Email" required />

        {/* Exercise 2 */}
        <input name="password" type="password" placeholder="Password" />
        {state.errors.password && (
          <p style={{ color: "red" }}>{state.errors.password}</p>
        )}

        <button type="submit" disabled={pending}>
          {pending ? "Submitting..." : "Submit"}
        </button>
      </form>

      {state.success && (
        <div>
          <p>Thanks for submitting!</p>
          <p>{state.message}</p>
        </div>
      )}
    </main>
  );
}