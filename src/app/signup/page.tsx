import { Suspense } from "react";
import { SignupForm } from "@/components/signup-form";

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="boot">Hold</div>}>
      <SignupForm />
    </Suspense>
  );
}
