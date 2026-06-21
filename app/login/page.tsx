import { AuthForm } from "@/components/AuthForm";
import { login } from "@/lib/actions/auth";

export default function LoginPage() {
  return <AuthForm mode="login" action={login} />;
}
