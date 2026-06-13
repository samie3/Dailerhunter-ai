const colorMap: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700",
  green: "bg-green-50 text-green-700",
  yellow: "bg-yellow-50 text-yellow-700",
  purple: "bg-purple-50 text-purple-700",
};

export function StatCard({
  label,
  value,
  icon,
  color = "blue",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border p-5">
      <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg mb-3 ${colorMap[color]}`}>
        {icon}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}
