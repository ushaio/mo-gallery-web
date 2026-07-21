const API_KEY = "sk-HloolAPI-01b0TpEcFTMeSF5SmDYRxtNADuXnzn2NXXeQGd9wy0ErtK2m";
const BASE_URL = "https://api.shuaiapi.com/v1" ?? "https://api.openai.com/v1";
const MODEL = "gpt-5.6-terra";

if (!API_KEY) {
  throw new Error("缺少 OPENAI_API_KEY 环境变量");
}

if (!MODEL) {
  throw new Error("缺少 OPENAI_MODEL 环境变量");
}

const MAX_STEPS = 10;

interface Order {
  orderId: string;
  status: string;
  trackingNumber?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface AssistantMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCall[];
}

interface UserMessage {
  role: "user";
  content: string;
}

interface SystemMessage {
  role: "system";
  content: string;
}

interface ToolMessage {
  role: "tool";
  tool_call_id: string;
  content: string;
}

type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage;

interface ChatCompletionResponse {
  choices?: Array<{
    message?: AssistantMessage;
  }>;
}

const tools = [
  {
    type: "function",
    function: {
      name: "get_order",
      description: "根据订单编号查询订单状态和物流信息",
      parameters: {
        type: "object",
        properties: {
          order_id: {
            type: "string",
            description: "订单编号，例如 A001",
          },
        },
        required: ["order_id"],
        additionalProperties: false,
      },
    },
  },
];

/**
 * 模拟数据库。实际项目中可以替换为 Prisma 查询或 HTTP API。
 */
const orders = new Map<string, Order>([
  [
    "A001",
    {
      orderId: "A001",
      status: "shipped",
      trackingNumber: "SF1234567890",
    },
  ],
  [
    "A002",
    {
      orderId: "A002",
      status: "processing",
    },
  ],
]);

function getOrder(orderId: string): Order | { error: string } {
  const order = orders.get(orderId);

  if (!order) {
    return {
      error: `找不到订单 ${orderId}`,
    };
  }

  return order;
}

function parseArguments(argumentsText: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(argumentsText);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("工具参数必须是对象");
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    return {
      __parseError:
        error instanceof Error ? error.message : "无法解析工具参数",
    };
  }
}

async function executeTool(
  name: string,
  argumentsText: string,
): Promise<unknown> {
  const args = parseArguments(argumentsText);

  if ("__parseError" in args) {
    return {
      error: `工具参数解析失败：${String(args.__parseError)}`,
    };
  }

  switch (name) {
    case "get_order": {
      const orderId = args.order_id;

      if (typeof orderId !== "string" || orderId.trim() === "") {
        return {
          error: "order_id 必须是非空字符串",
        };
      }

      return getOrder(orderId.trim());
    }

    default:
      return {
        error: `不支持的工具：${name}`,
      };
  }
}

async function callModel(
  messages: Message[],
): Promise<AssistantMessage> {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `模型请求失败：${response.status} ${response.statusText}\n${errorText}`,
    );
  }

  const result = (await response.json()) as ChatCompletionResponse;
  const message = result.choices?.[0]?.message;

  if (!message) {
    throw new Error("模型响应中没有 assistant message");
  }

  return message;
}

async function runAgent(userInput: string): Promise<string> {
  const messages: Message[] = [
    {
      role: "system",
      content: [
        "你是一个订单查询助手。",
        "需要订单数据时，必须使用 get_order 工具。",
        "不得编造订单状态或物流信息。",
        "如果工具返回错误，请明确告诉用户。",
        "使用简体中文回答。",
      ].join("\n"),
    },
    {
      role: "user",
      content: userInput,
    },
  ];

  for (let step = 1; step <= MAX_STEPS; step += 1) {
    console.log(`\n--- Agent 第 ${step} 步 ---`);

    const assistantMessage = await callModel(messages);
    messages.push(assistantMessage);

    const toolCalls = assistantMessage.tool_calls ?? [];

    // 没有工具调用，说明模型已经生成最终答案。
    if (toolCalls.length === 0) {
      return assistantMessage.content ?? "模型没有返回答案";
    }

    for (const toolCall of toolCalls) {
      console.log(`调用工具：${toolCall.function.name}`);
      console.log(`工具参数：${toolCall.function.arguments}`);

      const toolResult = await executeTool(
        toolCall.function.name,
        toolCall.function.arguments,
      );

      console.log("工具结果：", toolResult);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  throw new Error(`Agent 超过最大执行步数：${MAX_STEPS}`);
}

const userInput = process.argv.slice(2).join(" ").trim();

if (!userInput) {
  throw new Error(
    '请传入问题，例如：pnpm exec tsx scripts/minimal-agent.ts "查询订单 A001"',
  );
}

runAgent(userInput)
  .then((answer) => {
    console.log("\n--- 最终答案 ---");
    console.log(answer);
  })
  .catch((error: unknown) => {
    console.error(
      "\nAgent 执行失败：",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  });