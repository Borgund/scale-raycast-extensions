import { List, Icon, Color, Action, ActionPanel } from "@raycast/api";
import { colors, palette } from "@scaleaq/scaleui-tokens";

export default function Command() {
  // @ts-expect-error the type is correctly inferred
  const flattenedColorTokens = flattenTokens(colors);
  // @ts-expect-error the type is correctly inferred
  const flattenedPaletteTokens = flattenTokens(palette, "palette");
  return (
    <List searchBarPlaceholder="Search SUI Tokens">
      <List.EmptyView
        icon={{ source: Icon.ExclamationMark, tintColor: Color.Red }}
        title="No Endpoints Configured"
        description="Add a new endpoint using the + button"
      />
      <List.Section title="Color Tokens">
        {flattenedColorTokens.map(({ name, value }) => (
          <TokenItem key={name} name={name} value={value} />
        ))}
      </List.Section>
      <List.Section title="Palette Tokens">
        {flattenedPaletteTokens.map(({ name, value }) => (
          <TokenItem key={name} name={name} value={value} />
        ))}
      </List.Section>
    </List>
  );
}

function TokenItem({ name, value }: { name: string; value: string }) {
  return (
    <List.Item
      key={name}
      title={name}
      subtitle={value}
      icon={{ source: Icon.Swatch, tintColor: value }}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Token Name" content={name} />
          <Action.Paste title="Insert Token Name" content={name} />
          <Action.CopyToClipboard
            title="Copy Var()"
            shortcut={{ modifiers: ["shift"], key: "enter" }}
            content={value}
          />
          <Action.Paste title="Insert Var()" shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }} content={value} />
        </ActionPanel>
      }
    />
  );
}

function flattenTokens(
  obj: Record<string, Record<string, string> | string>,
  prefix = "",
): { name: string; value: string }[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const newKey = prefix ? `${prefix}-${key}` : key;
    if (typeof value === "object") {
      return flattenTokens(value, newKey);
    }
    return [{ name: `--sui-${newKey}`, value }];
  });
}
