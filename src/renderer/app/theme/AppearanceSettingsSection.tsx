import { useState } from "react";
import { FormField } from "../../components/ui/Field.tsx";
import Select from "../../components/ui/Select.tsx";
import { InlineNotice } from "../../components/ui/Notice.tsx";
import { THEMES, type Appearance } from "./themeModel.ts";
import { setThemePreference, useThemePreference } from "./themeStore.ts";

export default function AppearanceSettingsSection() {
  const preference = useThemePreference();
  const [error, setError] = useState<string | null>(null);
  return (
    <section
      className="rounded-2xl border border-border bg-card px-5 py-5 shadow-sm sm:px-7"
      aria-labelledby="appearance-title"
    >
      <h2 id="appearance-title" className="text-sm font-semibold">
        外观
      </h2>
      <p className="mt-2 text-xs text-muted-foreground">
        更改后立即生效，阅读纸张和书籍封面保留各自的样式。
      </p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <FormField label="界面模式">
          {(control) => (
            <Select
              {...control}
              label="界面模式"
              size="md"
              options={[
                { value: "system", label: "跟随系统" },
                { value: "light", label: "浅色" },
                { value: "dark", label: "深色" },
              ]}
              value={preference.appearance}
              onChange={(value) => {
                try {
                  setThemePreference({
                    ...preference,
                    appearance: value as Appearance,
                  });
                  setError(null);
                } catch {
                  setError("无法保存外观偏好，请重试。");
                }
              }}
            />
          )}
        </FormField>
        {THEMES.length > 1 && (
          <FormField label="配色">
            {(control) => (
              <Select
                {...control}
                label="配色"
                size="md"
                options={THEMES.map((theme) => ({
                  value: theme.id,
                  label: theme.label,
                }))}
                value={preference.paletteId}
                onChange={(value) => {
                  try {
                    setThemePreference({
                      ...preference,
                      paletteId: value,
                    });
                    setError(null);
                  } catch {
                    setError("无法保存外观偏好，请重试。");
                  }
                }}
              />
            )}
          </FormField>
        )}
      </div>
      {error && (
        <InlineNotice tone="danger" className="mt-4">
          {error}
        </InlineNotice>
      )}
    </section>
  );
}
