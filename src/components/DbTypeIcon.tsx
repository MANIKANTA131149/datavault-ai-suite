import { Database, Server, Cloud, HardDrive, Snowflake, BarChart2, Zap, Layers, Search } from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  mysql:         Database,
  postgresql:    Database,
  sqlserver:     Server,
  oracle:        Cloud,
  mariadb:       Database,
  sqlite:        HardDrive,
  mongodb:       Database,
  snowflake:     Snowflake,
  bigquery:      BarChart2,
  redshift:      Zap,
  databricks:    Layers,
  clickhouse:    Database,
  duckdb:        Database,
  elasticsearch: Search,
};

export function DbTypeIcon({
  dbType,
  size = 16,
  className,
}: {
  dbType: string;
  size?: number;
  className?: string;
}) {
  const Icon = ICON_MAP[dbType] || Database;
  return <Icon size={size} className={className} />;
}
