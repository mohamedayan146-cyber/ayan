import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "ai-agents-essentials" });
import { inngest } from "../client";

export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "test/hello.world" },
  async ({ event, step }) => {
    const greeting = await step.run("create-greeting", async () => {
      return `Hello, ${event.data.name ?? "there"}!`;
    });

    return { greeting };
  }
);
import { inngest } from "../client";

export const dataProcessor = inngest.createFunction(
  { id: "data-processor" },
  { event: "data/process" },
  async ({ event, step }) => {
    const source: string = event.data.source ?? "unknown";

    // Step 1: fetch the raw data
    const fetched = await step.run("fetch-data", async () => {
      console.log(`Fetching data from: ${source}`);
      return {
        source,
        records: [
          { id: 1, value: 10 },
          { id: 2, value: 20 },
          { id: 3, value: 30 },
        ],
      };
    });

    // Step 2: transform, using step 1's output
    const transformed = await step.run("transform-data", async () => {
      console.log(`Transforming ${fetched.records.length} records`);
      return fetched.records.map((record) => ({
        ...record,
        value: record.value * 2,
      }));
    });

    // Step 3: save, using step 2's output
    const saved = await step.run("save-data", async () => {
      console.log(`Saving ${transformed.length} records`);
      return {
        saved: transformed.length,
        total: transformed.reduce((sum, record) => sum + record.value, 0),
      };
    });

    return { source, ...saved };
  }
);
import { inngest } from "../client";

export const rateLimitedEmailSender = inngest.createFunction(
  { id: "rate-limited-email-sender" },
  { event: "email/batch.send" },
  async ({ event, step }) => {
    const emails: string[] = event.data.emails ?? [];
    const delaySeconds: number = event.data.delaySeconds ?? 5;

    for (let i = 0; i < emails.length; i++) {
      await step.run(`send-email-${i}`, async () => {
        console.log(`Sending email ${i + 1}/${emails.length} to ${emails[i]}`);
        return { to: emails[i], sent: true };
      });

      // Pause between sends to stay under the provider's rate limit
      if (i < emails.length - 1) {
        await step.sleep(`wait-after-email-${i}`, `${delaySeconds}s`);
      }
    }

    return { sent: emails.length };
  }
);
import { inngest } from "../client";

export const approvalWorkflow = inngest.createFunction(
  { id: "approval-workflow" },
  { event: "workflow/start" },
  async ({ event, step }) => {
    const { requestId, action } = event.data;

    // Step 1: Process the request
    const processed = await step.run("process-request", async () => {
      console.log(`Processing request: ${action}`);
      return { requestId, action, status: "pending_approval" };
    });

    // Step 2: Wait for approval (up to 1 hour)
    const approval = await step.waitForEvent("wait-for-approval", {
      event: "workflow/approval",
      timeout: "1h",
      match: "data.requestId", // Match on requestId
    });

    if (!approval) {
      return {
        requestId,
        status: "timeout",
        message: "Approval not received within 1 hour",
      };
    }

    if (approval.data.approved === false) {
      return {
        requestId,
        status: "rejected",
        message: "The request was rejected",
      };
    }

    // Step 3: Execute approved action
    const result = await step.run("execute-action", async () => {
      console.log(`Executing approved action: ${processed.action}`);
      return { requestId, action: processed.action, status: "completed" };
    });

    return result;
  }
);
export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Inngest Essentials</h1>
      <p>
        Open the Inngest Dev Server at <code>http://localhost:8288</code> to invoke functions
        and watch runs.
      </p>
    </main>
  );
}

// hello-world
{ "data": { "name": "duniya" } }

// data-processor
{ "data": { "source": "api" } }

// rate-limited-email-sender
{ "data": { "emails": ["a@example.com", "b@example.com", "c@example.com"], "delaySeconds": 5 } }

// reminder
{ "data": { "message": "Stand up and stretch", "delayMinutes": 1 } }

// approval-workflow: first invoke with this
{ "data": { "requestId": "req-123", "action": "deploy-to-production" } }

// then send an event named workflow/approval with this
{ "data": { "requestId": "req-123", "approved": true } }
