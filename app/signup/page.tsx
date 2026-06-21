import { AuthForm } from "@/components/AuthForm";
import { signup } from "@/lib/actions/auth";

export default function SignupPage() {
  return <AuthForm mode="signup" action={signup} />;
}
