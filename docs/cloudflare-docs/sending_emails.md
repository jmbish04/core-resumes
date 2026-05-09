---
title: Cloudflare Email Routing
description: Create custom email addresses for your domain and route incoming emails to your preferred mailbox.
image: https://developers.cloudflare.com/dev-products-preview.png
---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Cloudflare Email Routing

Create custom email addresses for your domain and route incoming emails to your preferred mailbox.

Email Routing is now part of Email Service

Email Routing is now integrated into [Cloudflare Email Service](https://developers.cloudflare.com/email-service/), a complete email product suite. Email Service provides all the routing capabilities you already use, as well as the ability to send emails from Workers or external servers using a REST API.

For new projects, refer to the [Email Service documentation](https://developers.cloudflare.com/email-service/). Existing Email Routing configurations continue to work without changes.

Available on all plans

Cloudflare Email Routing is designed to simplify the way you create and manage email addresses, without needing to keep an eye on additional mailboxes. With Email Routing, you can create any number of custom email addresses to use in situations where you do not want to share your primary email address, such as when you subscribe to a new service or newsletter. Emails are then routed to your preferred email inbox, without you ever having to expose your primary email address.

Email Routing is free and private by design. Cloudflare will not store or access the emails routed to your inbox.

It is available to all Cloudflare customers [using Cloudflare as an authoritative nameserver](https://developers.cloudflare.com/dns/zone-setups/full-setup/), meaning Cloudflare manages your domain's DNS records.

---

## Features

### Email Workers

Process incoming emails with code using Cloudflare Workers. Filter by sender, auto-reply, forward based on content, or build any custom logic you need.

[ Use Email Workers ](https://developers.cloudflare.com/email-routing/email-workers/)

### Custom addresses

Create separate email addresses for different purposes, such as shopping, newsletters, or work contacts, all forwarding to a single inbox.

[ Use Custom addresses ](https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/)

### Analytics

Email Routing includes metrics to help you check on your email traffic history.

[ Use Analytics ](https://developers.cloudflare.com/email-routing/get-started/email-routing-analytics/)

---

## Related products

**[Email security](https://developers.cloudflare.com/cloudflare-one/email-security/)**

Cloudflare Email security is a cloud based service that stops phishing attacks, the biggest cybersecurity threat, across all traffic vectors - email, web and network.

**[DNS](https://developers.cloudflare.com/dns/)**

Email Routing is available to customers using Cloudflare as an authoritative nameserver.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    }
  ]
}
```

---

---

title: Get started
description: Set up Email Routing to create custom email addresses and forward incoming emails to your preferred mailbox.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Get started

To enable Email Routing, start by creating a custom email address linked to a destination address or Email Worker. This forms an **email rule**. You can enable or disable rules from the Cloudflare dashboard. Refer to [Enable Email Routing](https://developers.cloudflare.com/email-routing/get-started/enable-email-routing) for more details.

Custom addresses you create with Email Routing work as forward addresses only. Emails sent to custom addresses are forwarded by Email Routing to your destination inbox. Cloudflare does not process outbound email, and does not have an SMTP server.

The first time you access Email Routing, you will see a wizard guiding you through the process of creating email rules. You can skip the wizard and add rules manually.

If you need to pause Email Routing or offboard to another service, refer to [Disable Email Routing](https://developers.cloudflare.com/email-routing/setup/disable-email-routing/).

- [ Enable Email Routing ](https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/)
- [ Test Email Routing ](https://developers.cloudflare.com/email-routing/get-started/test-email-routing/)
- [ Analytics ](https://developers.cloudflare.com/email-routing/get-started/email-routing-analytics/)
- [ Audit logs ](https://developers.cloudflare.com/email-routing/get-started/audit-logs/)

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": { "@id": "/email-routing/get-started/", "name": "Get started" }
    }
  ]
}
```

---

---

title: Audit logs
description: Track Email Routing configuration changes such as rule edits and address additions in Cloudflare audit logs.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Audit logs

Audit logs for Email Routing are available in the [Cloudflare dashboard ↗](https://dash.cloudflare.com/?account=audit-log). The following changes to Email Routing will be displayed:

- Add/edit Rule
- Add address
- Address change status
- Enable/disable/unlock zone

Refer to [Review audit logs](https://developers.cloudflare.com/fundamentals/account/account-security/review-audit-logs/) for more information.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": { "@id": "/email-routing/get-started/", "name": "Get started" }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/email-routing/get-started/audit-logs/",
        "name": "Audit logs"
      }
    }
  ]
}
```

---

---

title: Analytics
description: Review Email Routing metrics for received, forwarded, dropped, and rejected emails, and inspect activity logs.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Analytics

The Overview page shows you a summary of your account. You can check details such as how many custom and destination addresses you have configured, as well as the status of your routing service.

## Email Routing summary

In Email Routing summary you can check metrics related the number of emails received, forwarded, dropped, and rejected. To filter this information by time interval, select the drop-down menu. You can choose preset periods between the previous 30 minutes and 30 days, as well as a custom date range.

## Activity Log

This section allows you to sort through emails received, and check Email Routing actions - for example, `Forwarded`, `Dropped`, or `Rejected`. Select a specific email to expand its details and check information regarding the [SPF ↗](https://datatracker.ietf.org/doc/html/rfc7208), [DKIM ↗](https://datatracker.ietf.org/doc/html/rfc6376), and [DMARC ↗](https://datatracker.ietf.org/doc/html/rfc7489) statuses. Depending on the information shown, you can opt to mark an email as spam or block the sender.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": { "@id": "/email-routing/get-started/", "name": "Get started" }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/email-routing/get-started/email-routing-analytics/",
        "name": "Analytics"
      }
    }
  ]
}
```

---

---

title: Enable Email Routing
description: Add the required DNS records and create your first email routing rule to start forwarding emails.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Enable Email Routing

Important

Enabling Email Routing adds the appropriate `MX` records to the DNS settings of your zone in order for the service to work. You can [change these MX records](https://developers.cloudflare.com/email-routing/setup/email-routing-dns-records/) at any time. However, depending on how you configure them, Email Routing might stop working.

1. In the Cloudflare dashboard, go to the **Email Routing** page.  
   [ Go to **Email Routing** ](https://dash.cloudflare.com/?to=/:account/:zone/email/routing)
2. Review the records that will be added to your zone.
3. Select **Add records and enable**.
4. Go to **Routing rules**.
5. For **Custom addresses**, select **Create address**.
6. Enter the custom email address you want to use (for example, `my-new-email@example.com`).
7. In **Destination addresses**, enter the full email address you want your emails to be forwarded to — for example, `your-name@example.com`.  
   Notes  
   If you have several destination addresses linked to the same custom email address (rule), Email Routing will only process the most recent rule. To avoid this, do not link several destination addresses to the same custom address.  
   The current implementation of email forwarding only supports a single destination address per custom address. To forward a custom address to multiple destinations you must create a Workers script to redirect the email to each destination. All the destinations used in the Workers script must be already validated.
8. Select **Save**.
9. Cloudflare will send a verification email to the address provided in the **Destination address** field. You must verify your email address before being able to proceed.
10. In the verification email Cloudflare sent you, select **Verify email address** \> **Go to Email Routing** to activate Email Routing.
11. Your Destination address should now show **Verified**, under **Status**. Select **Continue**.
12. Cloudflare needs to add the relevant `MX` and `TXT` records to DNS records for Email Routing to work. This step is automatic and is only needed the first time you configure Email Routing. It is meant to ensure you have the proper records configured in your zone. Select **Add records and finish**.

Email Routing is now enabled. You can add other custom addresses to your account.

Note

When Email Routing is configured and running, no other email services can be active in the domain you are configuring. If there are other `MX` records already configured in DNS, Cloudflare will ask you if you wish to delete them. If you do not delete existing `MX` records, Email Routing will not be enabled.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": { "@id": "/email-routing/get-started/", "name": "Get started" }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/email-routing/get-started/enable-email-routing/",
        "name": "Enable Email Routing"
      }
    }
  ]
}
```

---

---

title: Test Email Routing
description: Verify that your Email Routing configuration is working by sending a test email to your custom address.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Test Email Routing

To test that your configuration is working properly, send an email to the custom address [you set up in the dashboard](https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/). You should send your test email from a different address than the one you specified as the destination address.

For example, if you set up `your-name@gmail.com` as the destination address, do not send your test email from that same email account. Send a test email to that destination address from another email account (for example, `your-name@outlook.com`).

The reason for this is that some email providers will discard what they interpret as an incoming duplicate email and will not show it in your inbox, making it seem like Email Routing is not working properly.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": { "@id": "/email-routing/get-started/", "name": "Get started" }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/email-routing/get-started/test-email-routing/",
        "name": "Test Email Routing"
      }
    }
  ]
}
```

---

---

title: Email Workers
description: Process incoming emails programmatically with Cloudflare Workers to build custom filtering, forwarding, and notification logic.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Email Workers

With Email Workers you can leverage the power of Cloudflare Workers to implement any logic you need to process your emails and create complex rules. These rules determine what happens when you receive an email.

Creating your own rules with Email Workers is as easy or complex as you want. You can begin using one of the starter templates that are pre-populated with code for popular use-cases. These templates allow you to create a blocklist, allowlist, or send notifications to Slack.

If you prefer, you can skip the templates and use custom code. You can, for example, create logic that only accepts messages from a specific address, and then forwards them to one or more of your [verified email addresses](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/#destination-addresses), while also alerting you on Slack.

The following is an example of an allowlist Email Worker:

JavaScript

```

export default {

  async email(message, env, ctx) {

    const allowList = ["friend@example.com", "coworker@example.com"];

    if (allowList.indexOf(message.from) == -1) {

      message.setReject("Address not allowed");

    } else {

      await message.forward("inbox@corp");

    }

  },

};


```

Refer to the [Workers Languages](https://developers.cloudflare.com/workers/languages/) for more information regarding the languages you can use with Workers.

## How to use Email Workers

To use Email Routing with Email Workers there are three steps involved:

1. Creating the Email Worker.
2. Adding the logic to your Email Worker (like email addresses allowed or blocked from sending you emails).
3. Binding the Email Worker to a route. This is the email address that forwards emails to the Worker.

The route, or email address, bound to the Worker forwards emails to your Email Worker. The logic in the Worker will then decide if the email is forwarded to its final destination or dropped, and what further actions (if any) will be applied.

For example, say that you create an allowlist Email Worker and bind it to a `hello@my-company.com` route. This route will be the email address you share with the world, to make sure that only email addresses on your allowlist are forwarded to your destination address. All other emails will be dropped.

## Resources

- [Limits](https://developers.cloudflare.com/email-routing/limits/#email-workers-size-limits)
- [Runtime API](https://developers.cloudflare.com/email-routing/email-workers/runtime-api/)
- [Local development](https://developers.cloudflare.com/email-routing/email-workers/local-development/)

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": {
        "@id": "/email-routing/email-workers/",
        "name": "Email Workers"
      }
    }
  ]
}
```

---

---

title: Demos
description: Explore demo applications that show how to use Email Workers within your architecture.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Demos

Learn how you can use Email Workers within your existing architecture.

## Demos

Explore the following demo applications for Email Workers.

- [DMARC Email Worker: ↗](https://github.com/cloudflare/dmarc-email-worker) A Cloudflare worker script to process incoming DMARC reports, store them, and produce analytics.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": {
        "@id": "/email-routing/email-workers/",
        "name": "Email Workers"
      }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": { "@id": "/email-routing/email-workers/demos/", "name": "Demos" }
    }
  ]
}
```

---

---

title: Edit Email Workers
description: Add, rename, delete, or modify Email Workers and manage their associated email routes.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Edit Email Workers

Adding or editing Email Workers is straightforward. You can rename, delete or edit Email Workers, as well as change the routes bound to a specific Email Worker.

## Add an Email worker

1. In the Cloudflare dashboard, go to the **Email Routing** page.  
   [ Go to **Email Routing** ](https://dash.cloudflare.com/?to=/:account/:zone/email/routing)
2. Select **Email Workers**.
3. Select **Create**.
4. (Optional) Enter a descriptive Email Worker name in **Create a worker name**.
5. In **Select a starter**, select the starter template that best suits your needs. You can also start from scratch and build your own Email Worker with **Create my own**. After choosing your template, select **Create**.
6. Now, configure your code on the left side of the screen. For example, if you are creating an Email Worker from the Allowlist template:
   1. In `const allow = ["friend@example.com", "coworker@example.com"];` replace the email examples with the addresses you want to allow emails from.
   2. In `await message.forward("inbox@corp");` replace the email address example with the address where emails should be forwarded to.
7. (Optional) You can test your logic on the right side of the screen. In the **From** field, enter either an email address from your approved senders list or one that is not on the approved list. When you select **Trigger email event** you should see a message telling you if the email address is allowed or rejected.
8. Select **Save and deploy** to save your Email Worker when you are finished.
9. Select the arrow next to the name of your Email Worker to go back to the main screen.
10. Find the Email Worker you have just created, and select **Create route**. This binds the Email Worker to a route (or email address) you can share. All emails received in this route will be forwarded to and processed by the Email Worker.

Note

You have to create a new route to use with the Email Worker you created. You can have more than one route bound to the same Email Worker.

1. Select **Save** to finish setting up your Email Worker.

You have successfully created your Email Worker. In the Email Worker’s card, select the **route** field to expand it and check the routes associated with the Worker.

## Edit an Email Worker

1. In the Cloudflare dashboard, go to the **Email Routing** page.  
   [ Go to **Email Routing** ](https://dash.cloudflare.com/?to=/:account/:zone/email/routing)
2. Select **Email Workers**.
3. Find the Email Worker you want to rename, and select the three-dot button next to it.
4. Select **Code editor**.
5. Make the appropriate changes to your code.
6. Select **Save and deploy** when you are finished editing.

## Rename Email Worker

When you rename an Email Worker, you will lose the route that was previously bound to it. You will need to configure the route again after renaming the Email Worker.

1. In the Cloudflare dashboard, go to the **Email Routing** page.  
   [ Go to **Email Routing** ](https://dash.cloudflare.com/?to=/:account/:zone/email/routing)
2. Select **Email Workers**.
3. Find the Email Worker you want to rename, and select the three-dot button next to it.
4. From the drop-down menu, select **Manage Worker**.
5. Select **Manage Service** \> **Rename service**, and fill in the new Email Worker’s name.
6. Select **Continue** \> **Move**.
7. Acknowledge the warning and select **Finish**.
8. Now, go back to **Email** \> **Email Routing**.
9. In **Routes** find the custom address you previously had associated with your Email Worker, and select **Edit**.
10. In the **Destination** drop-down menu, select your renamed Email Worker.
11. Select **Save**.

## Edit route

The following steps show how to change a route associated with an Email Worker.

1. In the Cloudflare dashboard, go to the **Email Routing** page.  
   [ Go to **Email Routing** ](https://dash.cloudflare.com/?to=/:account/:zone/email/routing)
2. Select **Email Workers**.
3. Find the Email Worker you want to change the associated route, and select **route** on its card.
4. Select **Edit** to make the required changes.
5. Select **Save** to finish.

## Delete an Email Worker

1. In the Cloudflare dashboard, go to the **Email Routing** page.  
   [ Go to **Email Routing** ](https://dash.cloudflare.com/?to=/:account/:zone/email/routing)
2. Select **Email Workers**.
3. Find the Email Worker you want to delete, and select the three-dot button next to it.
4. From the drop-down menu, select **Manage Worker**.
5. Select **Manage Service** \> **Delete**.
6. Type the name of the Email Worker to confirm you want to delete it, and select **Delete**.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": {
        "@id": "/email-routing/email-workers/",
        "name": "Email Workers"
      }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/email-routing/email-workers/edit-email-workers/",
        "name": "Edit Email Workers"
      }
    }
  ]
}
```

---

---

title: Enable Email Workers
description: Set up your first Email Worker to process incoming emails with custom logic on Cloudflare Workers.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Enable Email Workers

Follow these steps to enable and add your first Email Worker. If you have never used Cloudflare Workers before, Cloudflare will create a subdomain for you, and assign you to the Workers [free pricing plan](https://developers.cloudflare.com/workers/platform/pricing/).

1. In the Cloudflare dashboard, go to the **Email Routing** page.  
   [ Go to **Email Routing** ](https://dash.cloudflare.com/?to=/:account/:zone/email/routing)
2. Select **Get started**.
3. In **Custom address**, enter the custom email address you want to use (for example, `my-new-email`).
4. In **Destination**, choose the email address or Email Worker you want your emails to be forwarded to — for example, `your-name@gmail.com`. You can only choose a destination address you have already verified. To add a new destination address, refer to [Destination addresses](https://developers.cloudflare.com/email-routing/setup/email-routing-addresses/#destination-addresses).
5. Select **Create and continue**.
6. Verify your destination address and select **Continue**.
7. Configure your DNS records and select **Add records and enable**.

You have successfully created your Email Worker. In the Email Worker’s card, select the **route** field to expand it and check the routes associated with the Worker.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": {
        "@id": "/email-routing/email-workers/",
        "name": "Email Workers"
      }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/email-routing/email-workers/enable-email-workers/",
        "name": "Enable Email Workers"
      }
    }
  ]
}
```

---

---

title: Local Development
description: Test Email Workers locally using Wrangler dev or the Cloudflare Vite plugin to simulate receiving, replying, and sending emails.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Local Development

You can test the behavior of an Email Worker script in local development using Wrangler with [wrangler dev](https://developers.cloudflare.com/workers/wrangler/commands/general/#dev), or using the [Cloudflare Vite plugin ↗](https://developers.cloudflare.com/workers/vite-plugin/).

This is the minimal wrangler configuration required to run an Email Worker locally:

- [ wrangler.jsonc ](#tab-panel-5706)
- [ wrangler.toml ](#tab-panel-5707)

JSONC

```

{

  "send_email": [

    {

      "name": "EMAIL"

    }

  ]

}


```

TOML

```

[[send_email]]

name = "EMAIL"


```

Note

If you want to deploy your script you need to [enable Email Routing](https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/) and have at least one verified [destination address](https://developers.cloudflare.com/email-routing/setup/email-routing-addresses/#destination-addresses).

You can now test receiving, replying, and sending emails in your local environment.

## Receive an email

Consider this example Email Worker script that uses the open source [postal-mime ↗](https://www.npmjs.com/package/postal-mime) email parser:

TypeScript

```

import * as PostalMime from 'postal-mime';


export default {

  async email(message, env, ctx) {

    const parser = new PostalMime.default();

    const rawEmail = new Response(message.raw);

    const email = await parser.parse(await rawEmail.arrayBuffer());

    console.log(email);

  },

};


```

Now when you run `npx wrangler dev`, wrangler will expose a local `/cdn-cgi/handler/email` endpoint that you can `POST` email messages to and trigger your Worker's `email()` handler:

Terminal window

```

curl --request POST 'http://localhost:8787/cdn-cgi/handler/email' \

  --url-query 'from=sender@example.com' \

  --url-query 'to=recipient@example.com' \

  --header 'Content-Type: application/json' \

  --data-raw 'Received: from smtp.example.com (127.0.0.1)

        by cloudflare-email.com (unknown) id 4fwwffRXOpyR

        for <recipient@example.com>; Tue, 27 Aug 2024 15:50:20 +0000

From: "John" <sender@example.com>

Reply-To: sender@example.com

To: recipient@example.com

Subject: Testing Email Workers Local Dev

Content-Type: text/html; charset="windows-1252"

X-Mailer: Curl

Date: Tue, 27 Aug 2024 08:49:44 -0700

Message-ID: <6114391943504294873000@ZSH-GHOSTTY>


Hi there'


```

This is what you get in the console:

```

{

  headers: [

    {

      key: 'received',

      value: 'from smtp.example.com (127.0.0.1) by cloudflare-email.com (unknown) id 4fwwffRXOpyR for <recipient@example.com>; Tue, 27 Aug 2024 15:50:20 +0000'

    },

    { key: 'from', value: '"John" <sender@example.com>' },

    { key: 'reply-to', value: 'sender@example.com' },

    { key: 'to', value: 'recipient@example.com' },

    { key: 'subject', value: 'Testing Email Workers Local Dev' },

    { key: 'content-type', value: 'text/html; charset="windows-1252"' },

    { key: 'x-mailer', value: 'Curl' },

    { key: 'date', value: 'Tue, 27 Aug 2024 08:49:44 -0700' },

    {

      key: 'message-id',

      value: '<6114391943504294873000@ZSH-GHOSTTY>'

    }

  ],

  from: { address: 'sender@example.com', name: 'John' },

  to: [ { address: 'recipient@example.com', name: '' } ],

  replyTo: [ { address: 'sender@example.com', name: '' } ],

  subject: 'Testing Email Workers Local Dev',

  messageId: '<6114391943504294873000@ZSH-GHOSTTY>',

  date: '2024-08-27T15:49:44.000Z',

  html: 'Hi there\n',

  attachments: []

}


```

## Send an email

Wrangler can also simulate sending emails locally. Consider this example Email Worker script that uses the [mimetext ↗](https://www.npmjs.com/package/mimetext) npm package:

TypeScript

```

import { EmailMessage } from "cloudflare:email";

import { createMimeMessage } from 'mimetext';


export default {

  async fetch(request, env, ctx) {

    const msg = createMimeMessage();

    msg.setSender({ name: 'Sending email test', addr: 'sender@example.com' });

    msg.setRecipient('recipient@example.com');

    msg.setSubject('An email generated in a worker');

    msg.addMessage({

      contentType: 'text/plain',

      data: `Congratulations, you just sent an email from a worker.`,

    });


    var message = new EmailMessage('sender@example.com', 'recipient@example.com', msg.asRaw());

    await env.EMAIL.send(message);

    return Response.json({ ok: true });

  }

};


```

Now when you run `npx wrangler dev`, go to [http://localhost:8787/ ↗](http://localhost:8787/) to trigger the `fetch()` handler and send the email. You will see the follow message in your terminal:

```

⎔ Starting local server...

[wrangler:inf] Ready on http://localhost:8787

[wrangler:inf] GET / 200 OK (19ms)

[wrangler:inf] send_email binding called with the following message:

  /var/folders/33/pn86qymd0w50htvsjp93rys40000gn/T/miniflare-f9be031ff417b2e67f2ac4cf94cb1b40/files/email/33e0a255-a7df-4f40-b712-0291806ed2b3.eml


```

Wrangler simulated `env.EMAIL.send()` by writing the email to a local file in [eml ↗](https://datatracker.ietf.org/doc/html/rfc5322) format. The file contains the raw email message:

```

Date: Fri, 04 Apr 2025 12:27:08 +0000

From: =?utf-8?B?U2VuZGluZyBlbWFpbCB0ZXN0?= <sender@example.com>

To: <recipient@example.com>

Message-ID: <2s95plkazox@example.com>

Subject: =?utf-8?B?QW4gZW1haWwgZ2VuZXJhdGVkIGluIGEgd29ya2Vy?=

MIME-Version: 1.0

Content-Type: text/plain; charset=UTF-8

Content-Transfer-Encoding: 7bit


Congratulations, you just sent an email from a worker.


```

## Reply to and forward messages

Likewise, [EmailMessage](https://developers.cloudflare.com/email-routing/email-workers/runtime-api/#emailmessage-definition)'s `forward()` and `reply()` methods are also simulated locally. Consider this Worker that receives an email, parses it, replies to the sender, and forwards the original message to one your verified recipient addresses:

TypeScript

```

import * as PostalMime from 'postal-mime';

import { createMimeMessage } from 'mimetext';

import { EmailMessage } from 'cloudflare:email';


export default {

  async email(message, env: any, ctx: any) {

    // parses incoming message

    const parser = new PostalMime.default();

    const rawEmail = new Response(message.raw);

    const email = await parser.parse(await rawEmail.arrayBuffer());


    // creates some ticket

    // const ticket = await createTicket(email);


    // creates reply message

    const msg = createMimeMessage();

    msg.setSender({ name: 'Thank you for your contact', addr: 'sender@example.com' });

    msg.setRecipient(message.from);

    msg.setHeader('In-Reply-To', message.headers.get('Message-ID'));

    msg.setSubject('An email generated in a worker');

    msg.addMessage({

      contentType: 'text/plain',

      data: `This is an automated reply. We received you email with the subject "${email.subject}", and will handle it as soon as possible.`,

    });


    const replyMessage = new EmailMessage('sender@example.com', message.from, msg.asRaw());


    await message.reply(replyMessage);

    await message.forward("recipient@example.com");

  },

};


```

Run `npx wrangler dev` and use curl to `POST` the same message from the [Receive an email](#receive-an-email) example. Your terminal will show you where to find the replied message in your local disk and to whom the email was forwarded:

```

⎔ Starting local server...

[wrangler:inf] Ready on http://localhost:8787

[wrangler:inf] Email handler replied to sender with the following message:

  /var/folders/33/pn86qymd0w50htvsjp93rys40000gn/T/miniflare-381a79d7efa4e991607b30a079f6b17d/files/email/a1db7ebb-ccb4-45ef-b315-df49c6d820c0.eml

[wrangler:inf] Email handler forwarded message with

  rcptTo: recipient@example.com


```

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": {
        "@id": "/email-routing/email-workers/",
        "name": "Email Workers"
      }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/email-routing/email-workers/local-development/",
        "name": "Local Development"
      }
    }
  ]
}
```

---

---

title: Reply to emails from Workers
description: Build smart auto-responders by replying to incoming emails programmatically with Email Workers.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Reply to emails from Workers

You can reply to incoming emails with another new message and implement smart auto-responders programmatically, adding any content and context in the main body of the message. Think of a customer support email automatically generating a ticket and returning the link to the sender, an out-of-office reply with instructions when you are on vacation, or a detailed explanation of why you rejected an email.

Reply to emails is a new method of the [EmailMessage object](https://developers.cloudflare.com/email-routing/email-workers/runtime-api/#emailmessage-definition) in the Runtime API. Here is how it works:

JavaScript

```

import { EmailMessage } from "cloudflare:email";

import { createMimeMessage } from "mimetext";


export default {

  async email(message, env, ctx) {


    const ticket = createTicket(message);


    const msg = createMimeMessage();

    msg.setHeader("In-Reply-To", message.headers.get("Message-ID"));

    msg.setSender({ name: "Thank you for your contact", addr: "<SENDER>@example.com" });

    msg.setRecipient(message.from);

    msg.setSubject("Email Routing Auto-reply");

    msg.addMessage({

      contentType: 'text/plain',

      data: `We got your message, your ticket number is ${ ticket.id }`

    });


    const replyMessage = new EmailMessage(

      "<SENDER>@example.com",

      message.from,

      msg.asRaw()

    );


    await message.reply(replyMessage);

  }

}


```

To mitigate security risks and abuse, replying to incoming emails has a few requirements and limits:

- The incoming email has to have valid [DMARC ↗](https://www.cloudflare.com/learning/dns/dns-records/dns-dmarc-record/).
- The email can only be replied to once in the same `EmailMessage` event.
- The recipient in the reply must match the incoming sender.
- The outgoing sender domain must match the same domain that received the email.
- Every time an email passes through Email Routing or another MTA, an entry is added to the `References` list. We stop accepting replies to emails with more than 100 `References` entries to prevent abuse or accidental loops.

If these and other internal conditions are not met, `reply()` will fail with an exception. Otherwise, you can freely compose your reply message, send it back to the original sender, and receive subsequent replies multiple times.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": {
        "@id": "/email-routing/email-workers/",
        "name": "Email Workers"
      }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/email-routing/email-workers/reply-email-workers/",
        "name": "Reply to emails from Workers"
      }
    }
  ]
}
```

---

---

title: Runtime API
description: Email Workers Runtime API reference for handling, forwarding, rejecting, and replying to incoming emails.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Runtime API

## Background

An `EmailEvent` is the event type to programmatically process your emails with a Worker. You can reject, forward, or drop emails according to the logic you construct in your Worker.

---

## Syntax: ES modules

`EmailEvent` can be handled in Workers functions written using the [ES modules format](https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/) by adding an `email` function to your module's exported handlers:

JavaScript

```

export default {

  async email(message, env, ctx) {

    await message.forward("<YOUR_EMAIL>");

  },

};


```

### Parameters

- `message` ForwardableEmailMessage
  - A [ForwardableEmailMessage object](#forwardableemailmessage-definition).
- `env` object
  - An object containing the bindings associated with your Worker using ES modules format, such as KV namespaces and Durable Objects.
- `ctx` object
  - An object containing the context associated with your Worker using ES modules format. Currently, this object just contains the `waitUntil` function.

---

## Syntax: Service Worker

Service Workers are deprecated

Service Workers are deprecated but still supported. We recommend using [Module Workers](https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/) instead. New features may not be supported for Service Workers.

`EmailEvent` can be handled in Workers functions written using the Service Worker syntax by attaching to the `email` event with `addEventListener`:

JavaScript

```

addEventListener("email", async (event) => {

  await event.message.forward("<YOUR_EMAIL>");

});


```

### Properties

- `event.message` ForwardableEmailMessage
  - An [ForwardableEmailMessage object](#forwardableemailmessage-definition).

---

## `ForwardableEmailMessage` definition

TypeScript

```

 interface ForwardableEmailMessage<Body = unknown> {

  readonly from: string;

  readonly to: string;

  readonly headers: Headers;

  readonly raw: ReadableStream;

  readonly rawSize: number;


  public constructor(from: string, to: string, raw: ReadableStream | string);


  setReject(reason: string): void;

  forward(rcptTo: string, headers?: Headers): Promise<void>;

  reply(message: EmailMessage): Promise<void>;

}


```

An email message that is sent to a consumer Worker and can be rejected/forwarded.

- `from` string
  - `Envelope From` attribute of the email message.
- `to` string
  - `Envelope To` attribute of the email message.
- `headers` Headers
  - A [Headers object ↗](https://developer.mozilla.org/en-US/docs/Web/API/Headers).
- `raw` ReadableStream
  - [Stream](https://developers.cloudflare.com/workers/runtime-apis/streams/readablestream) of the email message content.
- `rawSize` number
  - Size of the email message content.
- `setReject(reasonstring)` : void
  - Reject this email message by returning a permanent SMTP error back to the connecting client, including the given reason.
- `forward(rcptTostring, headersHeadersoptional)` : Promise
  - Forward this email message to a verified destination address of the account. If you want, you can add extra headers to the email message. Only `X-*` headers are allowed.
  - When the promise resolves, the message is confirmed to be forwarded to a verified destination address.
- `reply(EmailMessage)` : Promise
  - Reply to the sender of this email message with a new EmailMessage object.
  - When the promise resolves, the message is confirmed to be replied.

## `EmailMessage` definition

TypeScript

```

interface EmailMessage {

    readonly from: string;

    readonly to: string;

}


```

An email message that can be sent from a Worker.

- `from` string
  - `Envelope From` attribute of the email message.
- `to` string
  - `Envelope To` attribute of the email message.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": {
        "@id": "/email-routing/email-workers/",
        "name": "Email Workers"
      }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/email-routing/email-workers/runtime-api/",
        "name": "Runtime API"
      }
    }
  ]
}
```

---

---

title: Send emails from Workers
description: Use the send_email binding to send outbound emails from Cloudflare Workers through Email Routing.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Send emails from Workers

You can send an email about your Worker's activity from your Worker to an email address verified on [Email Routing](https://developers.cloudflare.com/email-routing/setup/email-routing-addresses/#destination-addresses). This is useful for when you want to know about certain types of events being triggered, for example.

Before you can bind an email address to your Worker, you need to [enable Email Routing](https://developers.cloudflare.com/email-routing/get-started/) and have at least one [verified email address](https://developers.cloudflare.com/email-routing/setup/email-routing-addresses/#destination-addresses). Then, create a new binding in the Wrangler configuration file:

- [ wrangler.jsonc ](#tab-panel-5708)
- [ wrangler.toml ](#tab-panel-5709)

JSONC

```

{

  "send_email": [

    {

      "name": "<NAME_FOR_BINDING>",

      "destination_address": "<YOUR_EMAIL>@example.com"

    }

  ]

}


```

TOML

```

[[send_email]]

name = "<NAME_FOR_BINDING>"

destination_address = "<YOUR_EMAIL>@example.com"


```

## Types of bindings

There are several types of restrictions you can configure in the bindings:

- **No attribute defined**: When you do not define an attribute, the binding has no restrictions in place. You can use it to send emails to any verified email address [through Email Routing](https://developers.cloudflare.com/email-routing/setup/email-routing-addresses/#destination-addresses).
- **`destination_address`**: When you define the `destination_address` attribute, you create a targeted binding. This means you can only send emails to the chosen email address. For example, `{type = "send_email", name = "<NAME_FOR_BINDING>", destination_address = "<YOUR_EMAIL>@example.com"}`.  
  For this particular binding, when you call the `send_email` function you can pass `null` or `undefined` to your Worker and it will assume the email address specified in the binding.
- **`allowed_destination_addresses`**: When you specify this attribute, you create an allowlist, and can send emails to any email address on the list.
- **`allowed_sender_addresses`**: When you specify this attribute, you create a sender allowlist, and can only send emails from an email address on the list.

You can add one or more types of bindings to your Wrangler file. However, each attribute must be on its own line:

- [ wrangler.jsonc ](#tab-panel-5710)
- [ wrangler.toml ](#tab-panel-5711)

JSONC

```

{

  "send_email": [

    {

      "name": "<NAME_FOR_BINDING1>"

    },

    {

      "name": "<NAME_FOR_BINDING2>",

      "destination_address": "<YOUR_EMAIL>@example.com"

    },

    {

      "name": "<NAME_FOR_BINDING3>",

      "allowed_destination_addresses": [

        "<YOUR_EMAIL>@example.com",

        "<YOUR_EMAIL2>@example.com"

      ]

    }

  ]

}


```

TOML

```

[[send_email]]

name = "<NAME_FOR_BINDING1>"


[[send_email]]

name = "<NAME_FOR_BINDING2>"

destination_address = "<YOUR_EMAIL>@example.com"


[[send_email]]

name = "<NAME_FOR_BINDING3>"

allowed_destination_addresses = [ "<YOUR_EMAIL>@example.com", "<YOUR_EMAIL2>@example.com" ]


```

## Example Worker

Refer to the example below to learn how to construct a Worker capable of sending emails. This example uses [MIMEText ↗](https://www.npmjs.com/package/mimetext):

Note

The sender has to be an email from the domain where you have Email Routing active.

JavaScript

```

import { EmailMessage } from "cloudflare:email";

import { createMimeMessage } from "mimetext";


export default {

  async fetch(request, env) {

    const msg = createMimeMessage();

    msg.setSender({ name: "Sender", addr: "<SENDER>@example.com" });

    msg.setRecipient("<RECIPIENT>@example.com");

    msg.setSubject("An email generated in a worker");

    msg.addMessage({

      contentType: "text/plain",

      data: `Congratulations, you just sent an email from a worker.`,

    });


    var message = new EmailMessage(

      "<SENDER>@example.com",

      "<RECIPIENT>@example.com",

      msg.asRaw(),

    );

    try {

      await env.SEB.send(message);

    } catch (e) {

      return new Response(e.message);

    }


    return new Response("Hello Send Email World!");

  },

};


```

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": {
        "@id": "/email-routing/email-workers/",
        "name": "Email Workers"
      }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/email-routing/email-workers/send-email-workers/",
        "name": "Send emails from Workers"
      }
    }
  ]
}
```

---

---

title: Troubleshooting
description: Diagnose and fix common Email Routing issues including misconfigured DNS records and SPF conflicts.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Troubleshooting

Email Routing warns you when your DNS records are not properly configured. In Email Routing's **Overview** page, you will see a message explaining what type of problem your account's DNS records have.

Refer to Email Routing's **Settings** tab on the dashboard for more information. Email Routing will list missing DNS records or warn you about duplicate sender policy framework (SPF) records, for example.

- [ DNS records ](https://developers.cloudflare.com/email-routing/troubleshooting/email-routing-dns-records/)
- [ SPF records ](https://developers.cloudflare.com/email-routing/troubleshooting/email-routing-spf-records/)

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": {
        "@id": "/email-routing/troubleshooting/",
        "name": "Troubleshooting"
      }
    }
  ]
}
```

---

---

title: DNS records
description: Fix missing or misconfigured DNS records that prevent Email Routing from working on your domain.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# DNS records

1. In the Cloudflare dashboard, go to the **Email Routing** page.  
   [ Go to **Email Routing** ](https://dash.cloudflare.com/?to=/:account/:zone/email/routing)
2. Go to **Settings**. Email Routing will show you the status of your DNS records, such as `Missing`.
3. Select **Enable Email Routing**.
4. The next page will show you what kind of action is needed. For example, if you are missing DNS records, select **Add records and enable**.

If there is a problem with your SPF records, refer to [Troubleshooting SPF records](https://developers.cloudflare.com/email-routing/troubleshooting/email-routing-spf-records/).

Note

If you are not using Email Routing but notice an Email Routing DNS record in your zone that you cannot delete, you can use the [Disable Email Routing API call](https://developers.cloudflare.com/api/resources/email%5Frouting/subresources/dns/methods/delete/). It will remove any unexpected records, such as DKIM TXT records like `cf2024-1._domainkey.<hostname>`.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": {
        "@id": "/email-routing/troubleshooting/",
        "name": "Troubleshooting"
      }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/email-routing/troubleshooting/email-routing-dns-records/",
        "name": "DNS records"
      }
    }
  ]
}
```

---

---

title: SPF records
description: Resolve duplicate SPF record conflicts that prevent Email Routing from forwarding emails correctly.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# SPF records

Having multiple [sender policy framework (SPF) records ↗](https://www.cloudflare.com/learning/dns/dns-records/dns-spf-record/) on your account is not allowed, and will prevent Email Routing from working properly. If your account has multiple SPF records, follow these steps to solve the issue:

1. In the Cloudflare dashboard, go to the **Email Routing** page. Email Routing will warn you that you have multiple SPF records.  
   [ Go to **Email Routing** ](https://dash.cloudflare.com/?to=/:account/:zone/email/routing)
2. Under **View DNS records**, select **Fix records**.
3. Delete the incorrect SPF record.

You should now have your SPF records correctly configured. If you are unsure of which SPF record to delete:

1. In the Cloudflare dashboard, go to the **Email Routing** page. Email Routing will warn you that you have multiple SPF records.  
   [ Go to **Email Routing** ](https://dash.cloudflare.com/?to=/:account/:zone/email/routing)
2. Under **View DNS records**, select **Fix records**.
3. Delete all SPF records.
4. Select **Add records and enable**.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": {
        "@id": "/email-routing/troubleshooting/",
        "name": "Troubleshooting"
      }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/email-routing/troubleshooting/email-routing-spf-records/",
        "name": "SPF records"
      }
    }
  ]
}
```

---

---

title: Limits
description: Email Routing limits for message size, rules, addresses, and Email Workers CPU and memory usage.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Limits

## Email Workers size limits

When you process emails with Email Workers on the [Workers Free plan](https://developers.cloudflare.com/workers/platform/pricing/), your Worker may exceed its CPU or memory allocation and fail with an error. This is more likely with large emails or complex processing logic. Refer to [Worker limits](https://developers.cloudflare.com/workers/platform/limits/#account-plan-limits) for more information.

You can use the [log functionality for Workers](https://developers.cloudflare.com/workers/observability/logs/) to look for messages related to CPU limits (such as `EXCEEDED_CPU`) and troubleshoot any issues regarding allocation errors.

If you encounter these error messages frequently, consider upgrading to the [Workers Paid plan](https://developers.cloudflare.com/workers/platform/pricing/) for higher usage limits.

## Message size

Currently, Email Routing does not support messages bigger than 25 MiB.

## Rules and addresses

Each rule maps one custom email address (like `info@yourdomain.com`) to one destination address or an [Email Worker](https://developers.cloudflare.com/email-routing/email-workers/).

| Feature                                                                                                           | Limit |
| ----------------------------------------------------------------------------------------------------------------- | ----- |
| [Rules](https://developers.cloudflare.com/email-routing/setup/email-routing-addresses/)                           | 200   |
| [Addresses](https://developers.cloudflare.com/email-routing/setup/email-routing-addresses/#destination-addresses) | 200   |

Need a higher limit?

To request an adjustment to a limit, complete the [Limit Increase Request Form ↗](https://forms.gle/ukpeZVLWLnKeixDu7). If the limit can be increased, Cloudflare will contact you with next steps.

## Email Routing summary for emails sent through Workers

Emails sent through Workers will show up in the Email Routing summary page as dropped even if they were successfully delivered.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": { "@id": "/email-routing/limits/", "name": "Limits" }
    }
  ]
}
```

---

---

title: Postmaster
description: Reference page with postmaster information for professionals, as well as a known limitations section.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Postmaster

This page provides technical information about Email Routing to professionals who administer email systems, and other email providers.

Here you will find information regarding Email Routing, along with best practices, rules, guidelines, troubleshooting tools, as well as known limitations for Email Routing.

## Postmaster

### Authenticated Received Chain (ARC)

Email Routing supports [Authenticated Received Chain (ARC) ↗](http://arc-spec.org/). When an email is forwarded, the destination server may not be able to verify the original sender's authentication because the email now comes from Cloudflare's servers rather than the sender's. ARC is an email authentication system that allows an intermediate email server (such as Email Routing) to attach a record of the original authentication results so the destination server can verify the email was legitimate before forwarding. Google also supports ARC.

### Contact information

The best way to contact us is using our [community forum ↗](https://community.cloudflare.com/new-topic?category=Feedback/Previews%20%26%20Betas&tags=email) or our [Discord server ↗](https://discord.com/invite/cloudflaredev).

### DKIM signature

[DKIM (DomainKeys Identified Mail) ↗](https://en.wikipedia.org/wiki/DomainKeys%5FIdentified%5FMail) ensures that email messages are not altered in transit between the sender and the recipient's SMTP servers through public-key cryptography.

Through this standard, the sender publishes its public key to a domain's DNS once, and then signs the body of each message before it leaves the server. The recipient server reads the message, gets the domain public key from the domain's DNS, and validates the signature to ensure the message was not altered in transit.

Email Routing adds two new signatures to the emails in transit, one on behalf of the Cloudflare domain used for [sender rewriting](#sender-rewriting) (`email.cloudflare.net`), and another one on behalf of the customer's recipient domain.

Below is the DKIM key for `email.cloudflare.net`:

Terminal window

```

dig TXT cf2024-1._domainkey.email.cloudflare.net +short


```

```

"v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAiweykoi+o48IOGuP7GR3X0MOExCUDY/BCRHoWBnh3rChl7WhdyCxW3jgq1daEjPPqoi7sJvdg5hEQVsgVRQP4DcnQDVjGMbASQtrY4WmB1VebF+RPJB2ECPsEDTpeiI5ZyUAwJaVX7r6bznU67g7LvFq35yIo4sdlmtZGV+i0H4cpYH9+3JJ78k" "m4KXwaf9xUJCWF6nxeD+qG6Fyruw1Qlbds2r85U9dkNDVAS3gioCvELryh1TxKGiVTkg4wqHTyHfWsp7KD3WQHYJn0RyfJJu6YEmL77zonn7p2SRMvTMP3ZEXibnC9gz3nnhR6wcYL8Q7zXypKTMD58bTixDSJwIDAQAB"


```

You can find the DKIM key for the customer's `example.com` domain by querying the following:

Terminal window

```

dig TXT cf2024-1._domainkey.example.com +short


```

### DMARC enforcing

Email Routing enforces Domain-based Message Authentication, Reporting & Conformance (DMARC). DMARC allows domain owners to publish a policy that tells receiving servers what to do when an email fails SPF and DKIM checks. Depending on the sender's DMARC policy, Email Routing will reject emails when there is an authentication failure. Refer to [dmarc.org ↗](https://dmarc.org/) for more information on this protocol.

It is recommended that all senders implement the DMARC protocol in order to successfully deliver email to Cloudflare.

### Mail authentication requirement

Cloudflare requires emails to [pass some form of authentication](https://developers.cloudflare.com/changelog/2025-06-30-mail-authentication/), either pass SPF verification or be correctly DKIM-signed to forward them. Having DMARC configured will also have a positive impact and is recommended.

### IPv6 support

Currently, Email Routing will connect to the upstream SMTP servers using IPv6 if they provide AAAA records for their MX servers, and fall back to IPv4 if that is not possible.

Below is an example of a popular provider that supports IPv6:

Terminal window

```

dig mx gmail.com


```

```

gmail.com. 3084 IN MX 5 gmail-smtp-in.l.google.com.

gmail.com. 3084 IN MX 20 alt2.gmail-smtp-in.l.google.com.

gmail.com. 3084 IN MX 40 alt4.gmail-smtp-in.l.google.com.

gmail.com. 3084 IN MX 10 alt1.gmail-smtp-in.l.google.com.

gmail.com. 3084 IN MX 30 alt3.gmail-smtp-in.l.google.com.


```

Terminal window

```

dig AAAA gmail-smtp-in.l.google.com


```

```

gmail-smtp-in.l.google.com. 17 IN AAAA 2a00:1450:400c:c09::1b


```

Email Routing also supports IPv6 through Cloudflare’s inbound MX servers.

### MX, SPF, and DKIM records

Email Routing automatically adds a few DNS records to the zone when our customers enable Email Routing. If we take `example.com` as an example:

```

example.com. 300 IN MX 13 amir.mx.cloudflare.net.

example.com. 300 IN MX 86 linda.mx.cloudflare.net.

example.com. 300 IN MX 24 isaac.mx.cloudflare.net.


example.com. 300 IN TXT "v=spf1 include:_spf.mx.cloudflare.net ~all"


```

[The MX (mail exchange) records ↗](https://www.cloudflare.com/learning/dns/dns-records/dns-mx-record/) tell the Internet where the inbound servers receiving email messages for the zone are. In this case, anyone who wants to send an email to `example.com` can use the `amir.mx.cloudflare.net`, `linda.mx.cloudflare.net`, or `isaac.mx.cloudflare.net` SMTP servers.

### Outbound prefixes

Email Routing sends its traffic using both IPv4 and IPv6 prefixes, when supported by the upstream SMTP server.

If you are a postmaster and are having trouble receiving Email Routing's emails, allow the following outbound IP addresses in your server configuration:

**IPv4**

`104.30.0.0/19`

**IPv6**

`2405:8100:c000::/38`

_Ranges last updated: December 13th, 2023_

### Outbound hostnames

In addition to the outbound prefixes, Email Routing will use the following outbound domains for the `HELO/EHLO` command:

- `cloudflare-email.net`
- `cloudflare-email.org`
- `cloudflare-email.com`

PTR records (reverse DNS) ensure that each hostname has an corresponding IP. For example:

Terminal window

```

dig a-h.cloudflare-email.net +short


```

```

104.30.0.7


```

Terminal window

```

dig -x 104.30.0.7 +short


```

```

a-h.cloudflare-email.net.


```

### Sender rewriting

Every email has two sender addresses: the envelope sender (the `MAIL FROM` address used during the SMTP transaction, which receiving servers check against SPF records) and the header `From:` address (what the recipient sees in their email client). When Email Routing forwards an email, the original sender's SPF record does not authorize Cloudflare's servers to send on their behalf, so SPF checks would fail at the destination.

To prevent this, Email Routing rewrites the envelope sender (`MAIL FROM`) to the forwarding domain using the [Sender Rewriting Scheme ↗](https://en.wikipedia.org/wiki/Sender%5FRewriting%5FScheme). The header `From:` address remains unchanged — recipients still see the original sender's address.

### SMTP errors

In most cases, Email Routing forwards the upstream SMTP errors back to the sender during the same SMTP connection (in-session), rather than generating a separate bounce message later.

### Realtime Block Lists

Email Routing checks the sender's IP address against blocklists — databases of IP addresses known to send spam or abusive email. These blocklists, called Realtime Block Lists (RBLs), are queried through a Domain Name System Blocklist (DNSBL) service. When the system detects an abusive IP, it blocks the email and returns an SMTP error:

```

554 <YOUR_IP_ADDRESS> found on one or more RBLs (abusixip). Refer to https://developers.cloudflare.com/email-routing/postmaster/#spam-and-abusive-traffic/


```

We update our RBLs regularly. You can use combined block list lookup services like [MxToolbox ↗](https://mxtoolbox.com/blacklists.aspx) to check if your IP matches other RBLs. IP reputation blocks are usually temporary, but if you feel your IP should be removed immediately, please contact the RBL's maintainer mentioned in the SMTP error directly.

### Anti-spam

In addition to DNSBL, Email Routing uses advanced heuristic and statistical analysis of the email's headers and text to calculate a spam score. We inject the score in the custom `X-Cf-Spamh-Score` header:

```

X-Cf-Spamh-Score: 2


```

This header is visible in the forwarded email. The higher the score, 5 being the maximum, the more likely the email is spam. Currently, this system is experimental and passive; we do not act on it and suggest that upstream servers and email clients do not act on it either.

We will update this page with more information as we fine-tune the system.

### SPF record

A SPF DNS record is an anti-spoofing mechanism that is used to specify which IP addresses and domains are allowed to send emails on behalf of your zone.

The Internet Engineering Task Force (IETF) tracks the SPFv1 specification [in RFC 7208 ↗](https://datatracker.ietf.org/doc/html/rfc7208). Refer to the [SPF Record Syntax ↗](http://www.open-spf.org/SPF%5FRecord%5FSyntax/) to learn the SPF syntax.

Email Routing's SPF record contains the following:

```

v=spf1 include:_spf.mx.cloudflare.net ~all


```

In the example above:

- `spf1`: Refers to SPF version 1, the most common and more widely adopted version of SPF.
- `include`: Include a second query to `_spf.mx.cloudflare.net` and allow its contents.
- `~all`: Otherwise [SoftFail ↗](http://www.open-spf.org/SPF%5FRecord%5FSyntax/) on all other origins. `SoftFail` means NOT allowed to send, but in transition. This instructs the upstream server to accept the email but mark it as suspicious if it came from any IP addresses outside of those defined in the SPF records.

If we do a TXT query to `_spf.mx.cloudflare.net`, we get:

```

_spf.mx.cloudflare.net. 300 IN TXT "v=spf1 ip4:104.30.0.0/20 ~all"


```

This response means:

- Allow all IPv4 IPs coming from the `104.30.0.0/20` subnet.
- Otherwise, `SoftFail`.

You can read more about SPF, DKIM, and DMARC in our [Tackling Email Spoofing and Phishing ↗](https://blog.cloudflare.com/tackling-email-spoofing/) blog.

---

## Known limitations

Below, you will find information regarding known limitations for Email Routing.

### Email address internationalization (EAI)

Email Routing does not support [internationalized email addresses ↗](https://en.wikipedia.org/wiki/International%5Femail). Email Routing only supports [internationalized domain names ↗](https://en.wikipedia.org/wiki/Internationalized%5Fdomain%5Fname).

This means that you can have email addresses with an internationalized domain, but not an internationalized local-part (the first part of your email address, before the `@` symbol). Refer to the following examples:

- `info@piñata.es` \- Supported.
- `piñata@piñata.es` \- Not supported.

### Non-delivery reports (NDRs)

Email Routing does not forward non-delivery reports to the original sender. This means the sender will not receive a notification indicating that the email did not reach the intended destination.

### Restrictive DMARC policies can make forwarded emails fail

Due to the nature of email forwarding, restrictive DMARC policies might make forwarded emails fail to be delivered. Refer to [dmarc.org ↗](https://dmarc.org/wiki/FAQ#My%5Fusers%5Foften%5Fforward%5Ftheir%5Femails%5Fto%5Fanother%5Fmailbox.2C%5Fhow%5Fdo%5FI%5Fkeep%5FDMARC%5Fvalid.3F) for more information.

### Sending or replying to an email from your Cloudflare domain

Email Routing does not support sending or replying from your Cloudflare domain. When you reply to emails forwarded by Email Routing, the reply will be sent from your destination address (like `my-name@gmail.com`), not your custom address (like `info@my-company.com`).

### "`.`" is treated as a normal character for custom addresses

The `.` character, which performs special actions in email providers like Gmail, is treated as a normal character on custom addresses.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": { "@id": "/email-routing/postmaster/", "name": "Postmaster" }
    }
  ]
}
```

---

## List destination addresses

**get** `/accounts/{account_id}/email/routing/addresses`

Lists existing destination addresses.

### Path Parameters

- `account_id: string`

  Identifier.

### Query Parameters

- `direction: optional "asc" or "desc"`

  Sorts results in an ascending or descending order.
  - `"asc"`

  - `"desc"`

- `page: optional number`

  Page number of paginated results.

- `per_page: optional number`

  Maximum number of results per page.

- `verified: optional true or false`

  Filter by verified destination addresses.
  - `true`

  - `false`

### Returns

- `errors: array of object { code, message, documentation_url, source }`
  - `code: number`

  - `message: string`

  - `documentation_url: optional string`

  - `source: optional object { pointer }`
    - `pointer: optional string`

- `messages: array of object { code, message, documentation_url, source }`
  - `code: number`

  - `message: string`

  - `documentation_url: optional string`

  - `source: optional object { pointer }`
    - `pointer: optional string`

- `success: true`

  Whether the API call was successful.
  - `true`

- `result: optional array of Address`
  - `id: optional string`

    Destination address identifier.

  - `created: optional string`

    The date and time the destination address has been created.

  - `email: optional string`

    The contact email address of the user.

  - `modified: optional string`

    The date and time the destination address was last modified.

  - `tag: optional string`

    Destination address tag. (Deprecated, replaced by destination address identifier)

  - `verified: optional string`

    The date and time the destination address has been verified. Null means not verified yet.

- `result_info: optional object { count, page, per_page, 2 more }`
  - `count: optional number`

    Total number of results for the requested service.

  - `page: optional number`

    Current page within paginated list of results.

  - `per_page: optional number`

    Number of results per page of results.

  - `total_count: optional number`

    Total results available without any search parameters.

  - `total_pages: optional number`

    The number of total pages in the entire result set.

### Example

```http
curl https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/email/routing/addresses \
    -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
    -H "X-Auth-Key: $CLOUDFLARE_API_KEY"
```

#### Response

```json
{
  "errors": [
    {
      "code": 1000,
      "message": "message",
      "documentation_url": "documentation_url",
      "source": {
        "pointer": "pointer"
      }
    }
  ],
  "messages": [
    {
      "code": 1000,
      "message": "message",
      "documentation_url": "documentation_url",
      "source": {
        "pointer": "pointer"
      }
    }
  ],
  "success": true,
  "result": [
    {
      "id": "ea95132c15732412d22c1476fa83f27a",
      "created": "2014-01-02T02:20:00Z",
      "email": "user@example.com",
      "modified": "2014-01-02T02:20:00Z",
      "tag": "ea95132c15732412d22c1476fa83f27a",
      "verified": "2014-01-02T02:20:00Z"
    }
  ],
  "result_info": {
    "count": 1,
    "page": 1,
    "per_page": 20,
    "total_count": 1,
    "total_pages": 100
  }
}
```

---

---

title: Querying Email Routing events with GraphQL
description: Query Email Routing activity logs via GraphQL.
image: https://developers.cloudflare.com/core-services-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/analytics/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Querying Email Routing events with GraphQL

This example uses the GraphQL Analytics API to query for Email Routing events over a specified time period.

## Activiy Logs API Call

The following API call will request Email Routing activity logs over a one day period, and output the requested fields. Be sure to replace `<CLOUDFLARE_ZONE_TAG>` and `<API_TOKEN>`[1](#user-content-fn-1) with your zone tag and API credentials, and adjust the `datetime_geg` and `datetime_leq` values as required.

Terminal window

```

echo '{ "query":

  "query EmailRoutingActivity($zoneTag: string, $filter: EmailRoutingAdaptiveFilter_InputObject) {

    viewer {

      zones(filter: { zoneTag: $zoneTag }) {

        emailRoutingAdaptive(

          filter: $filter

          limit: 3

          orderBy: [datetime_DESC]

        ) {

          datetime

          id: sessionId

          messageId

          from

          to

          subject

          status

          action

          spf

          dkim

          dmarc

          arc

          errorDetail

          isNDR

          isSpam

          spamThreshold

          spamScore

        }

      }

    }

  }",

  "variables": {

    "zoneTag": "<CLOUDFLARE_ZONE_TAG>",

    "filter": {

      "datetime_geq": "2026-01-18T11:00:00Z",

      "datetime_leq": "2026-01-19T11:00:00Z"

    }

  }

}' | tr -d '\n' | curl --silent \

https://api.cloudflare.com/client/v4/graphql \

--header "Authorization: Bearer <API_TOKEN>" \

--header "Accept: application/json" \

--header "Content-Type: application/json" \

--data @- | jq .


```

The results returned will be in JSON (as requested):

```

{

  "data": {

    "viewer": {

      "zones": [

        {

          "emailRoutingAdaptive": [

            {

              "action": "forward",

              "arc": "none",

              "datetime": "2026-01-19T10:51:25Z",

              "dkim": "pass",

              "dmarc": "pass",

              "errorDetail": "",

              "from": "John <john@email.example.com>",

              "id": "AfWyaZ7V1TAH",

              "isNDR": 0,

              "isSpam": 0,

              "messageId": "<9e6574f1-97f8-4060-ad62-c54b6408ac3f@local>",

              "spamScore": 0,

              "spamThreshold": 5,

              "spf": "pass",

              "status": "delivered",

              "subject": "How are you doing?",

              "to": "me@example.com"

            },

            {

              "action": "forward",

              "arc": "none",

              "datetime": "2026-01-19T10:30:00Z",

              "dkim": "pass",

              "dmarc": "pass",

              "errorDetail": "",

              "from": "eBay <ebay@ebay.co.uk>",

              "id": "aYPegrIfLWia",

              "isNDR": 0,

              "isSpam": 0,

              "messageId": "<1A513C40-F2CD808A928-029BBE999993-0000000000FA8855@starship>",

              "spamScore": 0,

              "spamThreshold": 5,

              "spf": "pass",

              "status": "delivered",

              "subject": "New offers",

              "to": "me@example.com"

            },

            {

              "action": "forward",

              "arc": "none",

              "datetime": "2026-01-19T10:29:59Z",

              "dkim": "pass",

              "dmarc": "pass",

              "errorDetail": "",

              "from": "Notification <notifications@example.com>",

              "id": "nWIl9gs95mY3",

              "isNDR": 0,

              "isSpam": 0,

              "messageId": "<0AB8F1C3-3015EDF2980-019BBE9B58F2-0000000000FA7C4D@local>",

              "spamScore": 0,

              "spamThreshold": 5,

              "spf": "pass",

              "status": "delivered",

              "subject": "You're over quota",

              "to": "me@example.com"

            }

          ]

        }

      ]

    }

  },

  "errors": null

}


```

## Analytics API Call

The following API call will count the number of events grouped by hour.

Terminal window

```

echo '{ "query":

  "query EmailRoutingActivity($zoneTag: string, $filter: EmailRoutingAdaptiveFilter_InputObject) {

     viewer {

       zones(filter: { zoneTag: $zoneTag }) {

         emailRoutingAdaptiveGroups(

           limit: 10000

           filter: $filter

           orderBy: [datetimeHour_ASC]

         ) { count

               dimensions {

                 datetimeHour

               }

             }

           }

     }

  }",

  "variables": {

    "zoneTag": "<CLOUDFLARE_ZONE_TAG>",

    "filter": {

      "datetimeHour_geq": "2026-01-18T11:00:00Z",

      "datetimeHour_leq": "2026-01-19T11:00:00Z"

    }

  }

}' | tr -d '\n' | curl --silent \

https://api.cloudflare.com/client/v4/graphql \

--header "Authorization: Bearer <API_TOKEN>" \

--header "Accept: application/json" \

--header "Content-Type: application/json" \

--data @- | jq .


```

The results returned will be in JSON (as requested):

```

{

  "data": {

    "viewer": {

      "zones": [

        {

          "emailRoutingAdaptiveGroups": [

            {

              "count": 2,

              "dimensions": {

                "datetimeHour": "2026-01-18T11:00:00Z"

              }

            },

            {

              "count": 1,

              "dimensions": {

                "datetimeHour": "2026-01-18T12:00:00Z"

              }

            },

            {

              "count": 1,

              "dimensions": {

                "datetimeHour": "2026-01-18T13:00:00Z"

              }

            },

            {

              "count": 2,

              "dimensions": {

                "datetimeHour": "2026-01-18T14:00:00Z"

              }

            },

            {

              "count": 1,

              "dimensions": {

                "datetimeHour": "2026-01-18T15:00:00Z"

              }

            },

            {

              "count": 1,

              "dimensions": {

                "datetimeHour": "2026-01-18T16:00:00Z"

              }

            },

            {

              "count": 2,

              "dimensions": {

                "datetimeHour": "2026-01-18T17:00:00Z"

              }

            },

            {

              "count": 3,

              "dimensions": {

                "datetimeHour": "2026-01-18T18:00:00Z"

              }

            },

            {

              "count": 1,

              "dimensions": {

                "datetimeHour": "2026-01-18T22:00:00Z"

              }

            },

            {

              "count": 2,

              "dimensions": {

                "datetimeHour": "2026-01-19T01:00:00Z"

              }

            },

            {

              "count": 1,

              "dimensions": {

                "datetimeHour": "2026-01-19T02:00:00Z"

              }

            },

            {

              "count": 4,

              "dimensions": {

                "datetimeHour": "2026-01-19T05:00:00Z"

              }

            },

            {

              "count": 1,

              "dimensions": {

                "datetimeHour": "2026-01-19T08:00:00Z"

              }

            },

            {

              "count": 5,

              "dimensions": {

                "datetimeHour": "2026-01-19T09:00:00Z"

              }

            },

            {

              "count": 6,

              "dimensions": {

                "datetimeHour": "2026-01-19T10:00:00Z"

              }

            },

            {

              "count": 2,

              "dimensions": {

                "datetimeHour": "2026-01-19T11:00:00Z"

              }

            }

          ]

        }

      ]

    }

  },

  "errors": null

}


```

## Footnotes

1. Refer to [Configure an Analytics API token](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/) for more information on configuration and permissions. [↩](#user-content-fnref-1)

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/analytics/", "name": "Analytics" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": {
        "@id": "/analytics/graphql-api/",
        "name": "GraphQL Analytics API"
      }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/analytics/graphql-api/tutorials/",
        "name": "Tutorials"
      }
    },
    {
      "@type": "ListItem",
      "position": 5,
      "item": {
        "@id": "/analytics/graphql-api/tutorials/querying-email-routing/",
        "name": "Querying Email Routing events with GraphQL"
      }
    }
  ]
}
```

---

---

title: Disable Email Routing
description: Delete and disable Email Routing or unlock DNS records to migrate to another email provider.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Disable Email Routing

Email Routing provides two options for disabling the service:

- **Delete and Disable**: This option will immediately disable Email Routing and remove its `MX` records. Your custom email addresses will stop working, and your email will not be routed to its final destination.
- **Unlock and keep DNS records**: (Advanced) This option is recommended if you plan to migrate to another provider. It allows you to add new `MX` records before disabling the service. Email Routing will stop working when you change your `MX` records.

## Delete and disable Email Routing

1. In the Cloudflare dashboard, go to the **Email Routing** page.  
   [ Go to **Email Routing** ](https://dash.cloudflare.com/?to=/:account/:zone/email/routing)
2. Select **Settings**.
3. Select **Start disabling** \> **Delete and Disable**. Email Routing will show you the list of records associated with your account that will be deleted.
4. Select **Delete records**.

Email Routing is now disabled for your account and will stop forwarding email. To enable the service again, select **Enable Email Routing** and follow the wizard.

## Unlock and keep DNS records

1. In the Cloudflare dashboard, go to the **Email Routing** page.  
   [ Go to **Email Routing** ](https://dash.cloudflare.com/?to=/:account/:zone/email/routing)
2. Select **Settings**.
3. Select **Start disabling** \> **Unlock records and continue**.
4. Select **Edit records on DNS**.

You now have the option to edit your DNS records to migrate your service to another provider.

Warning

Changing your DNS records will make Email Routing stop working. If you changed your mind and want to keep Email Routing working with your account, select **Lock DNS records**.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": { "@id": "/email-routing/setup/", "name": "Setup" }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/email-routing/setup/disable-email-routing/",
        "name": "Disable Email Routing"
      }
    }
  ]
}
```

---

---

title: Configure rules and addresses
description: Create, edit, and manage Email Routing custom addresses, destination addresses, and catch-all rules.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Configure rules and addresses

An email rule is a pair of a custom email address and a destination address, or a custom email address with an Email Worker. This allows you to route emails to your preferred inbox, or apply logic through Email Workers before deciding what should happen to your emails. You can have multiple custom addresses, to route email from specific providers to specific mail inboxes.

## Custom addresses

1. In the Cloudflare dashboard, go to the **Email Routing** page.  
   [ Go to **Email Routing** ](https://dash.cloudflare.com/?to=/:account/:zone/email/routing)
2. Select **Routing rules**.
3. Select **Create address**.
4. In **Custom address**, enter the custom email address you want to use (for example, `my-new-email`).
5. In the **Action** drop-down menu, choose what this email rule should do. Refer to [Email rule actions](#email-rule-actions) for more information.
6. In **Destination**, choose the email address or Email Worker you want your emails to be forwarded to — for example, `your-name@gmail.com`. You can only choose a destination address you have already verified. To add a new destination address, refer to [Destination addresses](#destination-addresses).

Note

If you have more than one destination address linked to the same custom address, Email Routing will only process the most recent rule. This means only the most recent pair of custom address and destination address (rule) will receive your forwarded emails. To avoid this, do not link more than one destination address to the same custom address.

### Email rule actions

When creating an email rule, you must specify an **Action**:

- _Send to an email_: Emails will be routed to your destination address. This is the default action.
- _Send to a Worker_: Emails will be processed by the logic in your [Email Worker](https://developers.cloudflare.com/email-routing/email-workers).
- _Drop_: Deletes emails sent to the custom address without routing them. This can be useful if you want to make an email address appear valid for privacy reasons.

Note

To prevent spamming unintended recipients, all email rules are automatically disabled until the destination address is validated by the user.

### Disable an email rule

1. In the Cloudflare dashboard, go to the **Email Routing** page.  
   [ Go to **Email Routing** ](https://dash.cloudflare.com/?to=/:account/:zone/email/routing)
2. Select **Routing rules**.
3. In **Custom addresses**, identify the email rule you want to pause, and toggle the status button to **Disabled**.

Your email rule is now disabled. It will not forward emails to a destination address or Email Worker. To forward emails again, toggle the email rule status button to **Active**.

### Edit custom addresses

1. Log in to the [Cloudflare dashboard ↗](https://dash.cloudflare.com/) and select your account and domain.
2. Go to **Email** \> **Email Routing** \> **Routes**.
3. In **Custom addresses**, identify the email rule you want to edit, and select **Edit**.
4. Make the appropriate changes to this custom address.

## Catch-all address

When you enable this feature, Email Routing will catch variations of email addresses to make them valid for the specified domain. For example, if you created an email rule for `info@example.com` and a sender accidentally types `ifno@example.com`, the email will still be correctly handled if you have **Catch-all addresses** enabled.

To enable Catch-all addresses:

1. Log in to the [Cloudflare dashboard ↗](https://dash.cloudflare.com/) and select your account and domain.
2. Go to **Email** \> **Email Routing** \> **Routes**.
3. Enable **Catch-all address**, so it shows as **Active**.
4. In the **Action** drop-down menu, select what to do with these emails. Refer to [Email rule actions](#email-rule-actions) for more information.
5. Select **Save**.

## Subaddressing

Email Routing supports subaddressing, also known as plus addressing, as defined in [RFC 5233 ↗](https://www.rfc-editor.org/rfc/rfc5233). This enables using the "+" separator to augment your custom addresses with arbitrary detail information.

You can enable subaddressing at **Email** \> **Email Routing** \> **Settings**.

Once enabled, you can use subaddressing with any of your custom addresses. For example, if you send an email to `user+detail@example.com` it will be captured by the `user@example.com` custom address. The `+detail` part is ignored by Email Routing, but it can be captured next in the processing chain in the logs, an [Email Worker](https://developers.cloudflare.com/email-routing/email-workers/) or an [Agent application ↗](https://github.com/cloudflare/agents/tree/main/examples/email-agent).

If a custom address `user+detail@example.com` already exists, it will take precedence over `user@example.com`. This prevents breaking existing routing rules for users, and allows certain sub-addresses to be captured by a specific rule.

## Destination addresses

This section lets you manage your destination addresses. It lists all email addresses already verified, as well as email addresses pending verification. You can resend verification emails or delete destination addresses.

Destination addresses are shared at the account level, and can be reused with any other domain in your account. This means the same destination address will be available to different domains in your account.

To prevent spam, email rules do not become active until after the destination address has been verified. Cloudflare sends a verification email to destination addresses specified in **Custom addresses**. You have to select **Verify email address** in that email to activate a destination address.

Note

Deleting a destination address automatically disables all email rules that use that email address as destination.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": { "@id": "/email-routing/setup/", "name": "Setup" }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/email-routing/setup/email-routing-addresses/",
        "name": "Configure rules and addresses"
      }
    }
  ]
}
```

---

---

title: DNS records
description: Check and manage the MX and SPF DNS records required for Email Routing to function correctly.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# DNS records

You can check the status of your DNS records in the **Settings** section of Email Routing. This section also allows you to troubleshoot any potential problems you might have with DNS records.

## Email DNS records

Check the status of your account's DNS records in the **Email DNS records** card:

- **Email DNS records configured** \- DNS records are properly configured.
- **Email DNS records misconfigured** \- There is a problem with your accounts DNS records. Select **Enable Email Routing** to [start troubleshooting problems](https://developers.cloudflare.com/email-routing/troubleshooting/).

### Start disabling

When you successfully configure Email Routing, your DNS records will be locked and the dashboard will show a **Start disabling** button in the Email DNS records card. This locked status is the recommended setting by Cloudflare. It means that the DNS records required for Email Routing to work are locked and can only be changed if you disable Email Routing on your domain.

If you need to delete Email Routing or migrate to another provider, select **Start disabling**. Refer to [Disable Email Routing](https://developers.cloudflare.com/email-routing/setup/disable-email-routing/) for more information.

### Lock DNS records

Depending on your zone configuration, you might have your DNS records unlocked. This will also be true if, for some reason, you have unlocked your DNS records. Select **Lock DNS records** to lock your DNS records and protect them from being accidentally changed or deleted.

## View DNS records

Select **View DNS records** for a list of the required `MX` and sender policy framework (SPF) records Email Routing is using.

If you are having trouble with your account's DNS records, refer to the [Troubleshooting](https://developers.cloudflare.com/email-routing/troubleshooting/) section.

## \_dc-mx DNS responses

If you see a DNS response with a `_dc-mx` prefix (for example, `_dc-mx.a1b2c3d4e5f6.example.com`), Cloudflare inserted it automatically. This response appears when your `MX` record points to a hostname that is [proxied](https://developers.cloudflare.com/dns/proxy-status/) through Cloudflare. The `_dc-mx` target itself resolves directly to your origin IP address so that mail traffic bypasses the proxy and reaches your mail server.

For more information, refer to [\_dc-mx and dc-##### subdomains](https://developers.cloudflare.com/dns/manage-dns-records/troubleshooting/unexpected-dns-records/#dc--and-%5Fdc-mx-subdomains).

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": { "@id": "/email-routing/setup/", "name": "Setup" }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/email-routing/setup/email-routing-dns-records/",
        "name": "DNS records"
      }
    }
  ]
}
```

---

---

title: Configure MTA-STS
description: Enable MTA Strict Transport Security for Email Routing to protect against downgrade and man-in-the-middle attacks.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Configure MTA-STS

MTA Strict Transport Security ([MTA-STS ↗](https://datatracker.ietf.org/doc/html/rfc8461)) was introduced by email service providers including Microsoft, Google and Yahoo as a solution to protect against downgrade and man-in-the-middle attacks in SMTP sessions, as well as solving the lack of security-first communication standards in email.

Suppose that `example.com` is your domain and uses Email Routing. Here is how you can enable MTA-STS for it.

1. In the Cloudflare dashboard, go to the **Records** page.  
   [ Go to **Records** ](https://dash.cloudflare.com/?to=/:account/:zone/dns/records)
2. Create a new CNAME record with the name `_mta-sts` that points to Cloudflare’s record `_mta-sts.mx.cloudflare.net`. Make sure to disable the proxy mode.
   ![MTA-STS CNAME record](https://developers.cloudflare.com/_astro/mta-sts-record.DbwO-t_X_1Mbxza.webp)
3. Confirm that the record was created:

Terminal window

```

dig txt _mta-sts.example.com


```

```

_mta-sts.example.com. 300 IN  CNAME _mta-sts.mx.cloudflare.net.

_mta-sts.mx.cloudflare.net. 300 IN  TXT "v=STSv1; id=20230615T153000;"


```

This tells the other end client that is trying to connect to us that we support MTA-STS.

Next you need an HTTPS endpoint at `mta-sts.example.com` to serve your policy file. This file defines the mail servers in the domain that use MTA-STS. The reason why HTTPS is used here instead of DNS is because not everyone uses DNSSEC yet, so we want to avoid another MITM attack vector.

To do this you need to deploy a Worker that allows email clients to pull Cloudflare’s Email Routing policy file using the “well-known” URI convention.

1. Go to your **Account** \> **Workers & Pages** and select **Create**. Pick the default "Hello World" option button, and replace the sample worker code with the following:

JavaScript

```

export default {

  async fetch(request, env, ctx) {

    return await fetch(

      "https://mta-sts.mx.cloudflare.net/.well-known/mta-sts.txt",

    );

  },

};


```

This Worker proxies `https://mta-sts.mx.cloudflare.net/.well-known/mta-sts.txt` to your own domain.

1. After deploying it, go to the Worker configuration, then **Settings** \> **Domains & Routes** \> **+Add**. Type the subdomain `mta-sts.example.com`.
   ![MTA-STS Worker Custom Domain](https://developers.cloudflare.com/_astro/mta-sts-domain.UfZmAoBe_lkXVJ.webp)

You can then confirm that your policy file is working with the following:

Terminal window

```

curl https://mta-sts.example.com/.well-known/mta-sts.txt


```

```

version: STSv1

mode: enforce

mx: *.mx.cloudflare.net

max_age: 86400


```

This says that you domain `example.com` enforces MTA-STS. Capable email clients will only deliver email to this domain over a secure connection to the specified MX servers. If no secure connection can be established the email will not be delivered.

Email Routing also supports MTA-STS upstream, which greatly improves security when forwarding your Emails to service providers like Gmail, Microsoft, and others.

While enabling MTA-STS involves a few steps today, we aim to simplify things for you and automatically configure MTA-STS for your domains from the Email Routing dashboard as a future improvement.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": { "@id": "/email-routing/setup/", "name": "Setup" }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/email-routing/setup/mta-sts/",
        "name": "Configure MTA-STS"
      }
    }
  ]
}
```

---

---

title: Subdomains
description: Add Email Routing to subdomains within your zone and create custom addresses for each subdomain.
image: https://developers.cloudflare.com/dev-products-preview.png

---

> Documentation Index  
> Fetch the complete documentation index at: https://developers.cloudflare.com/email-routing/llms.txt  
> Use this file to discover all available pages before exploring further.

[Skip to content](#%5Ftop)

# Subdomains

Email Routing is a [zone-level](https://developers.cloudflare.com/fundamentals/concepts/accounts-and-zones/#zones) feature. A zone has a top-level domain (the same as the zone name) and it can have subdomains (managed under the DNS feature.) As an example, you can have the `example.com` zone, and then the `mail.example.com` and `corp.example.com` sub-domains under it.

You can use Email Routing with any subdomain of any zone in your account. Follow these steps to add Email Routing features to a new subdomain:

1. In the Cloudflare dashboard, go to the **Email Routing** page.  
   [ Go to **Email Routing** ](https://dash.cloudflare.com/?to=/:account/:zone/email/routing)
2. Go to **Settings**, and select **Add subdomain**.

Once the subdomain is added and the DNS records are configured, you can see it in the **Settings** list under the **Subdomains** section.

Now you can go to **Email** \> **Email Routing** \> **Routing rules** and create new custom addresses that will show you the option of using either the top domain of the zone or any other configured subdomain.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": { "@id": "/directory/", "name": "Directory" }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": { "@id": "/email-routing/", "name": "Email Routing" }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": { "@id": "/email-routing/setup/", "name": "Setup" }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@id": "/email-routing/setup/subdomains/",
        "name": "Subdomains"
      }
    }
  ]
}
```
