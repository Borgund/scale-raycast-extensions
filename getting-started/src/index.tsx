import {
  List,
  getPreferenceValues,
  Icon,
  Color,
  Action,
  ActionPanel,
  Form,
  showToast,
  Toast,
  useNavigation,
  LocalStorage,
  Keyboard,
  Detail,
} from "@raycast/api";
import { useForm, FormValidation } from "@raycast/utils";
import { useEffect, useState } from "react";
import fetch from "node-fetch";

interface Preferences {
  timeout: number;
  refreshInterval: number;
}

interface Endpoint {
  name: string;
  url: string;
}

interface EndpointStatus {
  endpoint: Endpoint;
  status: "up" | "down" | "loading";
  responseTime?: number;
  error?: string;
  lastChecked: Date;
  responseData?: {
    status: number;
    headers: { [key: string]: string };
    body: string;
  };
}

interface EndpointFormValues {
  name: string;
  url: string;
}

const STORAGE_KEY = "health-check-endpoints";

async function getStoredEndpoints(): Promise<Endpoint[]> {
  const storedEndpoints = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (!storedEndpoints) return [];
  return JSON.parse(storedEndpoints);
}

function AddEndpointForm() {
  const { pop } = useNavigation();
  const { handleSubmit, itemProps } = useForm<EndpointFormValues>({
    async onSubmit(values) {
      try {
        await showToast({ style: Toast.Style.Animated, title: "Adding endpoint..." });

        // Get current endpoints
        const currentEndpoints = await getStoredEndpoints();

        // Add new endpoint
        const newEndpoint: Endpoint = {
          name: values.name,
          url: values.url,
        };
        const updatedEndpoints = [...currentEndpoints, newEndpoint];

        // Store updated endpoints
        await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(updatedEndpoints));

        await showToast({ style: Toast.Style.Success, title: "Endpoint added successfully" });
        pop();
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to add endpoint",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    validation: {
      name: FormValidation.Required,
      url: (value) => {
        if (!value) {
          return "URL is required";
        }
        try {
          new URL(value);
          if (!value.startsWith("http://") && !value.startsWith("https://")) {
            return "URL must start with http:// or https://";
          }
        } catch {
          return "Invalid URL format";
        }
      },
    },
  });

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Endpoint" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField title="Name" placeholder="My Service" {...itemProps.name} />
      <Form.TextField title="URL" placeholder="https://api.example.com/health" {...itemProps.url} />
    </Form>
  );
}

function EndpointDetailView({ status }: { status: EndpointStatus }) {
  const { pop } = useNavigation();

  return (
    <Detail
      markdown={`
# ${status.endpoint.name} \n
**URL:** ${status.endpoint.url} \n
**Status:** ${status.status.toUpperCase()} \n
**Last Checked:** ${status.lastChecked.toLocaleString()} \n
${status.responseTime ? `**Response Time:** ${status.responseTime}ms` : ""}
${status.error ? `\n## Error\n\`\`\`\n${status.error}\n\`\`\`` : ""}

${
  status.responseData
    ? `
## Response Details
**Status Code:** ${status.responseData.status}

### Headers
\`\`\`json
${JSON.stringify(status.responseData.headers, null, 2)}
\`\`\`

### Body
\`\`\`json
${status.responseData.body}
\`\`\`
`
    : ""
}
      `}
      actions={
        <ActionPanel>
          <Action
            title="Go back"
            icon={Icon.ArrowClockwise}
            onAction={() => pop()}
            shortcut={{ modifiers: ["cmd"], key: "x" }}
          />
        </ActionPanel>
      }
    />
  );
}

async function checkHealth(endpoint: Endpoint): Promise<EndpointStatus> {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getPreferenceValues<Preferences>().timeout * 1000);

    const response = await fetch(endpoint.url, {
      signal: controller.signal,
      method: "GET",
    });

    clearTimeout(timeout);
    const responseTime = Date.now() - startTime;

    let responseData;
    try {
      const body = await response.text();
      const headers: { [key: string]: string } = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      responseData = {
        status: response.status,
        headers,
        body,
      };
    } catch (error) {
      console.error("Failed to parse response:", error);
    }

    return {
      endpoint,
      status: response.ok ? "up" : "down",
      responseTime,
      lastChecked: new Date(),
      responseData,
    };
  } catch (error) {
    return {
      endpoint,
      status: "down",
      error: error instanceof Error ? error.message : "Unknown error",
      lastChecked: new Date(),
    };
  }
}

export default function Command() {
  const [statuses, setStatuses] = useState<EndpointStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const preferences = getPreferenceValues<Preferences>();

  useEffect(() => {
    async function fetchStatuses() {
      const endpoints = await getStoredEndpoints();
      const initialStatuses = endpoints.map((endpoint) => ({
        endpoint,
        status: "loading" as const,
        lastChecked: new Date(),
      }));
      setStatuses(initialStatuses);

      for (const endpoint of endpoints) {
        const status = await checkHealth(endpoint);
        setStatuses((prev) => prev.map((s) => (s.endpoint.url === endpoint.url ? status : s)));
      }
      setIsLoading(false);
    }

    fetchStatuses();
    const interval = setInterval(fetchStatuses, preferences.refreshInterval * 1000);

    return () => clearInterval(interval);
  }, []);

  const checkEndpoint = async (endpoint: Endpoint) => {
    const status = await checkHealth(endpoint);
    setStatuses((prevStatuses) =>
      prevStatuses.map((prevStatus) => (prevStatus.endpoint.url === endpoint.url ? status : prevStatus)),
    );
  };

  const getStatusIcon = (status: EndpointStatus["status"]) => {
    switch (status) {
      case "up":
        return { source: Icon.Checkmark, tintColor: Color.Green };
      case "down":
        return { source: Icon.XmarkCircle, tintColor: Color.Red };
      default:
        return { source: Icon.Circle, tintColor: Color.Yellow };
    }
  };

  return (
    <List
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action
            title="Check Now"
            shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
            icon={Icon.ArrowClockwise}
            onAction={() => setStatuses([])}
          />
          <Action.Push
            title="Add New Endpoint"
            shortcut={Keyboard.Shortcut.Common.New}
            icon={Icon.Plus}
            target={<AddEndpointForm />}
          />
        </ActionPanel>
      }
    >
      <List.EmptyView
        icon={{ source: Icon.ExclamationMark, tintColor: Color.Red }}
        title="No Endpoints Configured"
        description="Add a new endpoint using the + button"
      />
      {statuses.map((status) => (
        <List.Item
          key={status.endpoint.url}
          title={status.endpoint.name}
          subtitle={status.endpoint.url}
          accessories={[
            {
              text: status.lastChecked ? "Checked: " + new Date(status.lastChecked).toLocaleTimeString() : "Never",
              tooltip: "Last checked",
            },
            { icon: getStatusIcon(status.status) },
          ]}
          actions={
            <ActionPanel>
              <ActionPanel.Section>
                <Action title="Check Now" icon={Icon.ArrowClockwise} onAction={() => checkEndpoint(status.endpoint)} />
                <Action.Push
                  title="View Details"
                  icon={Icon.Eye}
                  target={<EndpointDetailView status={status} />}
                  shortcut={{ modifiers: ["cmd"], key: "d" }}
                />
                <Action.Push
                  title="Add New Endpoint"
                  shortcut={Keyboard.Shortcut.Common.New}
                  icon={Icon.Plus}
                  target={<AddEndpointForm />}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
