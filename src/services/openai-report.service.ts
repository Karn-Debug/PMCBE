import { z } from "zod";
import { HttpError } from "../utils/http-error.js";

type Input =
  | { type: "input_text"; text: string }
  | { type: "input_file"; filename: string; file_data: string };
export async function requestReportJson<T extends z.ZodType>(options: {
  schema: T;
  name: string;
  operation: string;
  instructions: string;
  content: Input[];
  timeout: number;
}): Promise<z.infer<T>> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key)
    throw new HttpError(
      503,
      options.operation + " needs OPENAI_API_KEY in the backend environment.",
    );
  const signal = AbortSignal.timeout(options.timeout);
  const { $schema, ...schema } = z.toJSONSchema(options.schema);
  const incomplete = () =>
    new HttpError(
      422,
      options.operation +
        " did not finish completely. Try a clearer or smaller report.",
    );
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal,
      redirect: "error",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_PDF_MODEL?.trim() || "gpt-4.1",
        store: false,
        max_output_tokens: 32768,
        instructions: options.instructions,
        input: [{ role: "user", content: options.content }],
        text: {
          format: {
            type: "json_schema",
            name: options.name,
            strict: true,
            schema,
          },
        },
      }),
    });
    if (!response.ok) {
      if ([401, 403, 404].includes(response.status))
        throw new HttpError(
          503,
          "Check the backend OpenAI API key and report model access.",
        );
      if (response.status === 429)
        throw new HttpError(
          503,
          "OpenAI’s quota or rate limit was reached. Check API billing or try again later.",
        );
      if ([400, 413].includes(response.status))
        throw new HttpError(
          422,
          "OpenAI could not process this report. Check the configured model or try a smaller file.",
        );
      throw new HttpError(
        502,
        "The report conversion service is unavailable. Try again.",
      );
    }
    const envelope = z
      .object({
        status: z.string(),
        output: z.array(
          z.object({
            type: z.string(),
            content: z
              .array(
                z.object({ type: z.string(), text: z.string().optional() }),
              )
              .optional(),
          }),
        ),
      })
      .parse(await response.json());
    const parts = envelope.output
      .filter((o) => o.type === "message")
      .flatMap((o) => o.content ?? []);
    if (
      envelope.status !== "completed" ||
      parts.some((p) => p.type === "refusal")
    )
      throw incomplete();
    const raw = parts
      .filter((p) => p.type === "output_text")
      .map((p) => p.text)
      .join("");
    return options.schema.parse(JSON.parse(raw));
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (signal.aborted)
      throw new HttpError(
        504,
        options.operation + " timed out. Try a smaller report.",
      );
    if (e instanceof SyntaxError || e instanceof z.ZodError) throw incomplete();
    throw new HttpError(
      502,
      "Could not reach the report conversion service. Please try again.",
    );
  }
}
