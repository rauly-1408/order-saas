import LoginForm from "./LoginForm";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  return <LoginForm tenant={tenant} />;
}
