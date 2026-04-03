export type ClientMessagingServiceId =
  | "oci_new"
  | "oci_renewal"
  | "passport_renewal";

/** Where to splice `minorAppend` when the Minor applicant toggle is on */
export type ClientMessagingMinorInsert = "please_send" | "once_receive";

export type ClientMessagingTemplate = {
  id: string;
  title: string;
  body: string;
  channelTag: "Email / WhatsApp";
  minorAppend?: string;
  /** Required when `minorAppend` is set */
  minorInsert?: ClientMessagingMinorInsert;
};

export const CHANNEL_TAG: ClientMessagingTemplate["channelTag"] =
  "Email / WhatsApp";

/** Shared block inserted for minor applicants on checklist templates */
export const CHECKLIST_MINOR_APPEND = `If the applicant is a minor (under 18), also include:
✅ Parent's address proof
✅ Both parents' passports if available`;

/** Shared by OCI New Message 2, OCI Renewal Message 2 */
export const OCI_NEW_MESSAGE_2_BODY = `Hi [Client Name],

Great news! Your OCI application has been successfully submitted to VFS Global / the Indian Consulate.

Your application reference number is: [APP NUMBER]

What happens next:
- The consulate will review your application (typically 8–12 weeks)
- You may be contacted if any additional documents are needed
- Once approved, your OCI card will be mailed to the address on file

We will keep you updated as we receive any news. In the meantime, please don't hesitate to reach out if you have any questions.

Thank you for trusting Akshar Travels!

Warm regards,
Akshar Travels`;

/** Shared by OCI New Message 3, OCI Renewal Message 3, Passport Renewal Message 3 */
export const OCI_NEW_MESSAGE_3_BODY = `Hi [Client Name],

Thank you for completing your OCI application with Akshar Travels! It was a pleasure working with you.

🎁 As a thank-you, we'd like to offer you a $50 gift card toward your next flight booking to India!

As your travel concierge, we can help you find the best flights to India and will price match any fare you find online. Just share the details and we'll take care of the rest.

We look forward to serving you on your next journey!

Warm regards,
Akshar Travels
[Phone / Email / WhatsApp]`;

const OCI_NEW_MESSAGE_1_BODY = `Hi [Client Name],

Thank you for choosing Akshar Travels for your OCI application! We're excited to get started.

To begin your application, please share the following documents with us:

REQUIRED DOCUMENTS:
✅ Current passport (all pages, including blank pages)
✅ Birth certificate
✅ Address proof (driver's license or utility bill)
✅ Applicant photo (white/light background, square, clear face)
✅ Applicant signature on white paper (scanned or photographed)
✅ Parent's Indian passport or OCI card (first and last page)

Please send all documents as clear scans or photos - avoid shadows and ensure all text is readable.

Once we receive everything, we will review and begin your application within 1–2 business days.

Feel free to reach out if you have any questions!

Warm regards,
Akshar Travels`;

const OCI_RENEWAL_MESSAGE_1_BODY = `Hi [Client Name],

Thank you for choosing Akshar Travels for your OCI renewal!

To begin your renewal application, please share the following:

REQUIRED DOCUMENTS:
✅ Current passport (all pages)
✅ Previous/old passport
✅ Existing OCI card (front and back)
✅ Address proof
✅ Applicant photo (white/light background, square)
✅ Applicant signature on white paper

Once we receive your documents, we will begin processing within 1–2 business days.

Warm regards,
Akshar Travels`;

const PASSPORT_RENEWAL_MESSAGE_1_BODY = `Hi [Client Name],

Thank you for choosing Akshar Travels for your Indian passport renewal!

Please share the following documents to get started:

REQUIRED DOCUMENTS:
✅ Current Indian passport (all pages including observation pages)
✅ Proof of US legal status (visa stamp, I-797, I-20, EAD, or Green Card)
✅ US address proof (driver's license, lease, or utility bill)
✅ Passport photo - 2×2 inch, white background, face 70–80% of photo (JPEG, 20KB–100KB)

Optional (if updating Indian address):
📎 Indian address proof

Once we receive your documents, we'll have everything ready for your VFS appointment.

Warm regards,
Akshar Travels`;

const PASSPORT_RENEWAL_MESSAGE_2_BODY = `Hi [Client Name],

Your Indian passport renewal application has been submitted to VFS Global.

Your reference number is: [APP NUMBER]

Processing typically takes 4–6 weeks. We'll keep you updated and let you know as soon as your new passport is ready.

Thank you for choosing Akshar Travels!

Warm regards,
Akshar Travels`;

const NEEDLE_PLEASE_SEND = "\n\nPlease send all documents";
const NEEDLE_ONCE_RECEIVE = "\n\nOnce we receive your documents";

export function composeClientMessagingBody(
  template: ClientMessagingTemplate,
  minorOn: boolean
): string {
  if (!template.minorAppend || !minorOn || !template.minorInsert) {
    return template.body;
  }
  const insert = `\n\n${template.minorAppend}`;
  const needle =
    template.minorInsert === "please_send"
      ? NEEDLE_PLEASE_SEND
      : NEEDLE_ONCE_RECEIVE;
  const i = template.body.indexOf(needle);
  if (i === -1) {
    return `${template.body}${insert}`;
  }
  return template.body.slice(0, i) + insert + template.body.slice(i);
}

export const CLIENT_MESSAGING_SERVICES: Array<{
  id: ClientMessagingServiceId;
  label: string;
}> = [
  { id: "oci_new", label: "OCI - New Application" },
  { id: "oci_renewal", label: "OCI - Renewal" },
  { id: "passport_renewal", label: "Passport Renewal" },
];

export const CLIENT_MESSAGING_TEMPLATES: Record<
  ClientMessagingServiceId,
  ClientMessagingTemplate[]
> = {
  oci_new: [
    {
      id: "oci_new_1",
      title: "Message 1 - Welcome & Document Checklist",
      body: OCI_NEW_MESSAGE_1_BODY,
      channelTag: CHANNEL_TAG,
      minorAppend: CHECKLIST_MINOR_APPEND,
      minorInsert: "please_send",
    },
    {
      id: "oci_new_2",
      title: "Message 2 - Application Submitted",
      body: OCI_NEW_MESSAGE_2_BODY,
      channelTag: CHANNEL_TAG,
    },
    {
      id: "oci_new_3",
      title: "Message 3 - Thank You + Gift Card",
      body: OCI_NEW_MESSAGE_3_BODY,
      channelTag: CHANNEL_TAG,
    },
  ],
  oci_renewal: [
    {
      id: "oci_renewal_1",
      title: "Message 1 - Welcome & Document Checklist",
      body: OCI_RENEWAL_MESSAGE_1_BODY,
      channelTag: CHANNEL_TAG,
      minorAppend: CHECKLIST_MINOR_APPEND,
      minorInsert: "once_receive",
    },
    {
      id: "oci_renewal_2",
      title: "Message 2 - Submitted",
      body: OCI_NEW_MESSAGE_2_BODY,
      channelTag: CHANNEL_TAG,
    },
    {
      id: "oci_renewal_3",
      title: "Message 3 - Thank You + Gift Card",
      body: OCI_NEW_MESSAGE_3_BODY,
      channelTag: CHANNEL_TAG,
    },
  ],
  passport_renewal: [
    {
      id: "passport_1",
      title: "Message 1 - Welcome & Document Checklist",
      body: PASSPORT_RENEWAL_MESSAGE_1_BODY,
      channelTag: CHANNEL_TAG,
      minorAppend: CHECKLIST_MINOR_APPEND,
      minorInsert: "once_receive",
    },
    {
      id: "passport_2",
      title: "Message 2 - Submitted",
      body: PASSPORT_RENEWAL_MESSAGE_2_BODY,
      channelTag: CHANNEL_TAG,
    },
    {
      id: "passport_3",
      title: "Message 3 - Thank You + Gift Card",
      body: OCI_NEW_MESSAGE_3_BODY,
      channelTag: CHANNEL_TAG,
    },
  ],
};
