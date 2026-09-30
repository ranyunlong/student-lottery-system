export default function AuthTemplate({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="route-enter min-w-0">{children}</div>;
}
