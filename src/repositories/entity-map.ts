import type { Module } from "../constants/modules.js";
export interface FieldMapping {
  api: string;
  column: string;
  numeric: boolean;
  date: boolean;
}
export interface ChildMapping {
  api: string;
  delegate: string;
  owner: string;
  fields: FieldMapping[];
  strings: boolean;
}
export interface EntityMapping {
  delegate: string;
  table: string;
  kind: string;
  fields: FieldMapping[];
  children: ChildMapping[];
  parent: string | null;
}
// Explicit API-to-table mapping. These are the only dynamic table names used by repositories.
export const entityMap: Record<Module, EntityMapping> = {
  tenders: {
    delegate: "tender",
    table: "Tender",
    kind: "TENDER",
    fields: [
      { api: "regulation", column: "regulation", numeric: false, date: false },
      { api: "units", column: "units", numeric: false, date: false },
      { api: "terms", column: "terms", numeric: false, date: false },
    ],
    children: [
      {
        api: "unitTypes",
        delegate: "tenderUnitType",
        owner: "tenderId",
        fields: [{ api: "name", column: "name", numeric: false, date: false }],
        strings: false,
      },
      {
        api: "otherTerms",
        delegate: "tenderTerm",
        owner: "tenderId",
        fields: [{ api: "name", column: "name", numeric: false, date: false }],
        strings: false,
      },
      {
        api: "requirements",
        delegate: "tenderRequirement",
        owner: "tenderId",
        fields: [
          { api: "section", column: "section", numeric: false, date: false },
          {
            api: "sectionSerial",
            column: "sectionSerial",
            numeric: false,
            date: false,
          },
          { api: "serial", column: "serial", numeric: false, date: false },
          {
            api: "description",
            column: "description",
            numeric: false,
            date: false,
          },
          { api: "offer", column: "offer", numeric: false, date: false },
          { api: "remarks", column: "remarks", numeric: false, date: false },
        ],
        strings: false,
      },
    ],
    parent: null,
  },
  quotes: {
    delegate: "quotation",
    table: "Quotation",
    kind: "QUOTE",
    fields: [
      {
        api: "developerName",
        column: "developerName",
        numeric: false,
        date: false,
      },
      { api: "amount", column: "quotedAmount", numeric: true, date: false },
      {
        api: "additionalArea",
        column: "additionalArea",
        numeric: true,
        date: false,
      },
      { api: "rent", column: "rent", numeric: true, date: false },
      { api: "corpus", column: "corpus", numeric: true, date: false },
      {
        api: "completionMonths",
        column: "completionMonths",
        numeric: false,
        date: false,
      },
    ],
    children: [],
    parent: "tenderId",
  },
  "work-orders": {
    delegate: "workOrder",
    table: "WorkOrder",
    kind: "WORK_ORDER",
    fields: [
      {
        api: "developerName",
        column: "developerName",
        numeric: false,
        date: false,
      },
      { api: "tds", column: "tds", numeric: true, date: false },
      { api: "retention", column: "retention", numeric: true, date: false },
      { api: "terms", column: "terms", numeric: false, date: false },
    ],
    children: [
      {
        api: "items",
        delegate: "workOrderItem",
        owner: "workOrderId",
        fields: [
          {
            api: "description",
            column: "description",
            numeric: false,
            date: false,
          },
          { api: "quantity", column: "quantity", numeric: true, date: false },
          { api: "rate", column: "rate", numeric: true, date: false },
          { api: "tax", column: "tax", numeric: true, date: false },
        ],
        strings: false,
      },
    ],
    parent: null,
  },
  invoices: {
    delegate: "invoice",
    table: "Invoice",
    kind: "INVOICE",
    fields: [
      {
        api: "developerName",
        column: "developerName",
        numeric: false,
        date: false,
      },
      { api: "tds", column: "tds", numeric: true, date: false },
      { api: "retention", column: "retention", numeric: true, date: false },
      { api: "terms", column: "terms", numeric: false, date: false },
    ],
    children: [
      {
        api: "items",
        delegate: "invoiceItem",
        owner: "invoiceId",
        fields: [
          {
            api: "description",
            column: "description",
            numeric: false,
            date: false,
          },
          { api: "quantity", column: "quantity", numeric: true, date: false },
          { api: "rate", column: "rate", numeric: true, date: false },
          { api: "tax", column: "tax", numeric: true, date: false },
        ],
        strings: false,
      },
    ],
    parent: "workOrderId",
  },
  permissions: {
    delegate: "permission",
    table: "Permission",
    kind: "PERMISSION",
    fields: [
      { api: "type", column: "type", numeric: false, date: false },
      { api: "scheme", column: "scheme", numeric: false, date: false },
      { api: "authority", column: "authority", numeric: false, date: false },
      { api: "expiry", column: "expiry", numeric: false, date: true },
      { api: "flagged", column: "flagged", numeric: false, date: false },
      { api: "documents", column: "documents", numeric: false, date: false },
    ],
    children: [],
    parent: null,
  },
  tasks: {
    delegate: "task",
    table: "Task",
    kind: "TASK",
    fields: [{ api: "topic", column: "topic", numeric: false, date: false }],
    children: [],
    parent: null,
  },
  topics: {
    delegate: "topic",
    table: "Topic",
    kind: "TOPIC",
    fields: [],
    children: [
      {
        api: "members",
        delegate: "topicMember",
        owner: "topicId",
        fields: [{ api: "name", column: "name", numeric: false, date: false }],
        strings: true,
      },
    ],
    parent: null,
  },
  documents: {
    delegate: "document",
    table: "Document",
    kind: "DOCUMENT",
    fields: [
      { api: "format", column: "format", numeric: false, date: false },
      { api: "category", column: "category", numeric: false, date: false },
      { api: "revision", column: "revision", numeric: false, date: false },
    ],
    children: [],
    parent: null,
  },
  templates: {
    delegate: "template",
    table: "Template",
    kind: "TEMPLATE",
    fields: [
      { api: "format", column: "format", numeric: false, date: false },
      { api: "category", column: "category", numeric: false, date: false },
      { api: "header", column: "header", numeric: false, date: false },
      { api: "footer", column: "footer", numeric: false, date: false },
    ],
    children: [
      {
        api: "requirements",
        delegate: "templateRequirement",
        owner: "templateId",
        fields: [
          { api: "section", column: "section", numeric: false, date: false },
          {
            api: "description",
            column: "description",
            numeric: false,
            date: false,
          },
          { api: "offer", column: "offer", numeric: false, date: false },
          { api: "remarks", column: "remarks", numeric: false, date: false },
        ],
        strings: false,
      },
    ],
    parent: null,
  },
  feasibility: {
    delegate: "feasibility",
    table: "Feasibility",
    kind: "FEASIBILITY",
    fields: [
      { api: "plotArea", column: "plotArea", numeric: true, date: false },
      { api: "fsi", column: "fsi", numeric: true, date: false },
      { api: "saleRate", column: "saleRate", numeric: true, date: false },
      {
        api: "constructionRate",
        column: "constructionRate",
        numeric: true,
        date: false,
      },
      { api: "otherCost", column: "otherCost", numeric: true, date: false },
    ],
    children: [],
    parent: null,
  },
  meetings: {
    delegate: "meeting",
    table: "Meeting",
    kind: "MEETING",
    fields: [
      { api: "location", column: "location", numeric: false, date: false },
      { api: "attendees", column: "attendees", numeric: false, date: false },
      { api: "agenda", column: "agenda", numeric: false, date: false },
      { api: "minutes", column: "minutes", numeric: false, date: false },
    ],
    children: [],
    parent: null,
  },
  progress: {
    delegate: "progressUpdate",
    table: "ProgressUpdate",
    kind: "PROGRESS",
    fields: [
      { api: "percent", column: "percent", numeric: true, date: false },
      { api: "videoUrl", column: "videoUrl", numeric: false, date: false },
    ],
    children: [],
    parent: null,
  },
  developers: {
    delegate: "developer",
    table: "Developer",
    kind: "DEVELOPER",
    fields: [
      { api: "email", column: "email", numeric: false, date: false },
      { api: "phone", column: "phone", numeric: false, date: false },
      { api: "contact", column: "contact", numeric: false, date: false },
      { api: "address", column: "address", numeric: false, date: false },
    ],
    children: [],
    parent: null,
  },
  schemes: {
    delegate: "permissionScheme",
    table: "PermissionScheme",
    kind: "SCHEME",
    fields: [
      { api: "type", column: "type", numeric: false, date: false },
      { api: "scheme", column: "scheme", numeric: false, date: false },
      { api: "documents", column: "documents", numeric: false, date: false },
    ],
    children: [],
    parent: null,
  },
};
