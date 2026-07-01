import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn().mockResolvedValue({ messageId: "test-id" });

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail }),
  },
}));

describe("emailService sendOutboundMail", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMail.mockClear();
    process.env.SMTP_USER = "smtp@test.com";
    process.env.SMTP_PASS = "secret";
    process.env.EMAIL_FROM = "team@wroket.com";
  });

  afterEach(() => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.EMAIL_FROM;
  });

  it("delegates to nodemailer transporter without recursion", async () => {
    const { sendAppFeedbackEmails } = await import("./emailService");
    const result = await sendAppFeedbackEmails({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      message: "Hello",
      locale: "fr",
    });
    expect(result).toEqual({ teamSent: true, ackSent: true });
    expect(sendMail).toHaveBeenCalledTimes(2);
  });
});
