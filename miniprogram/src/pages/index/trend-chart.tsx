import { Text, View } from "@tarojs/components";
import { useMemo } from "react";

type Person = { uid: string; nickname: string; color: string };
type WeightEntry = { id: string; ownerUid: string; weightKg: number; recordedAt: number };

const DAY = 24 * 60 * 60 * 1000;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function downsample(entries: WeightEntry[], maximum = 32) {
  if (entries.length <= maximum) return entries;
  return Array.from({ length: maximum }, (_, index) => (
    entries[Math.round((index * (entries.length - 1)) / (maximum - 1))]
  ));
}

export default function TrendChart({
  entries,
  people,
  rangeDays,
  endTime,
}: {
  entries: WeightEntry[];
  people: Person[];
  rangeDays: number;
  endTime: number;
}) {
  const chart = useMemo(() => {
    const end = endTime;
    const start = end - rangeDays * DAY;
    const visible = entries.filter((entry) => entry.recordedAt >= start && entry.recordedAt <= end);
    if (!visible.length) return null;
    const values = visible.map((entry) => entry.weightKg);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const padding = Math.max(1, (rawMax - rawMin) * 0.14);
    const minimum = Math.floor((rawMin - padding) * 2) / 2;
    const maximum = Math.ceil((rawMax + padding) * 2) / 2;
    const span = Math.max(1, maximum - minimum);
    return {
      minimum,
      maximum,
      series: people.map((person) => ({
        ...person,
        points: downsample(visible
          .filter((entry) => entry.ownerUid === person.uid)
          .sort((left, right) => left.recordedAt - right.recordedAt))
          .map((entry) => ({
            ...entry,
            left: clamp(((entry.recordedAt - start) / (end - start)) * 100, 0, 100),
            top: clamp(((maximum - entry.weightKg) / span) * 100, 0, 100),
          })),
      })),
    };
  }, [endTime, entries, people, rangeDays]);

  if (!chart) {
    return <View className="weight-chart view-trend-chart empty-trend"><Text>🌱 这个区间还没有体重记录</Text></View>;
  }

  return (
    <View className="weight-chart view-trend-chart">
      {[0, 1, 2, 3, 4].map((line) => (
        <View className="trend-grid-line" key={line} style={{ top: `${line * 25}%` }} />
      ))}
      <Text className="trend-axis trend-axis-max">{chart.maximum.toFixed(1)}</Text>
      <Text className="trend-axis trend-axis-min">{chart.minimum.toFixed(1)}</Text>
      {chart.series.map((series) => (
        <View className="trend-series" key={series.uid}>
          {series.points.slice(1).flatMap((point, index) => {
            const previous = series.points[index];
            return Array.from({ length: 9 }, (_, step) => {
              const ratio = (step + 1) / 10;
              const left = previous.left + (point.left - previous.left) * ratio;
              const top = previous.top + (point.top - previous.top) * ratio;
              return <View className="trend-path-dot" key={`line-${point.id}-${step}`} style={{ left: `${left}%`, top: `${top}%`, background: series.color }} />;
            });
          })}
          {series.points.map((point) => (
            <View className="trend-point" key={point.id} style={{ left: `${point.left}%`, top: `${point.top}%`, borderColor: series.color }} />
          ))}
        </View>
      ))}
    </View>
  );
}
