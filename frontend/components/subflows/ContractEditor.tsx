"use client";

import { Plus, Trash2, X } from "lucide-react";
import type { FactDefinition, FactSchema, FactType } from "@/types/flow";


const factTypes: FactType[] = ["string", "number", "boolean", "date", "enum"];

export function ContractEditor({
  inputSchema,
  outputSchema,
  onInputSchemaChange,
  onOutputSchemaChange,
  onClose,
  title = "Component contract",
  help = "Inputs enter an isolated subflow fact store. Outputs are explicitly mapped back to the parent.",
}: {
  inputSchema: FactSchema;
  outputSchema: FactSchema;
  onInputSchemaChange: (schema: FactSchema) => void;
  onOutputSchemaChange: (schema: FactSchema) => void;
  onClose: () => void;
  title?: string;
  help?: string;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="contract-dialog" role="dialog" aria-modal="true" aria-labelledby="contract-title">
        <header>
          <div>
            <p className="eyebrow">Typed interface</p>
            <h2 id="contract-title">{title}</h2>
          </div>
          <button className="icon-button" aria-label="Close contract" onClick={onClose} type="button"><X size={17} /></button>
        </header>
        <p className="contract-help">{help}</p>
        <div className="contract-columns">
          <ContractSection
            title="Inputs"
            prefix="input"
            schema={inputSchema}
            onChange={onInputSchemaChange}
          />
          <ContractSection
            title="Outputs"
            prefix="output"
            schema={outputSchema}
            onChange={onOutputSchemaChange}
          />
        </div>
        <footer><button className="primary-button" onClick={onClose} type="button">Done</button></footer>
      </section>
    </div>
  );
}


function ContractSection({
  title,
  prefix,
  schema,
  onChange,
}: {
  title: string;
  prefix: string;
  schema: FactSchema;
  onChange: (schema: FactSchema) => void;
}) {
  const entries = Object.entries(schema);
  const addField = () => {
    let index = entries.length + 1;
    let name = `${prefix}_${index}`;
    while (schema[name]) {
      index += 1;
      name = `${prefix}_${index}`;
    }
    onChange({
      ...schema,
      [name]: { type: "string", required: true, description: "", values: [] },
    });
  };
  const update = (name: string, definition: FactDefinition) => onChange({ ...schema, [name]: definition });
  const rename = (oldName: string, nextName: string) => {
    const clean = nextName.trim().replace(/[^a-zA-Z0-9_.-]/g, "_");
    if (!clean || (clean !== oldName && schema[clean])) return;
    const next: FactSchema = {};
    for (const [name, definition] of Object.entries(schema)) {
      next[name === oldName ? clean : name] = definition;
    }
    onChange(next);
  };

  return (
    <section className="contract-section">
      <div className="contract-section-heading">
        <h3>{title}</h3>
        <button className="secondary-button" onClick={addField} type="button"><Plus size={14} /> Add</button>
      </div>
      {entries.length === 0 ? <p className="contract-empty">No {title.toLowerCase()} defined.</p> : null}
      {entries.map(([name, definition], fieldIndex) => (
        <div className="contract-field" key={`${prefix}-${fieldIndex}`}>
          <div className="contract-field-main">
            <input aria-label={`${title} fact name`} defaultValue={name} onBlur={(event) => rename(name, event.target.value)} />
            <select
              aria-label={`${name} type`}
              value={definition.type}
              onChange={(event) => update(name, { ...definition, type: event.target.value as FactType })}
            >
              {factTypes.map((factType) => <option key={factType} value={factType}>{factType}</option>)}
            </select>
            <button
              className="mini-icon-button"
              aria-label={`Remove ${name}`}
              onClick={() => onChange(Object.fromEntries(entries.filter(([itemName]) => itemName !== name)))}
              type="button"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <input
            aria-label={`${name} description`}
            placeholder="Description"
            value={definition.description}
            onChange={(event) => update(name, { ...definition, description: event.target.value })}
          />
          {definition.type === "enum" ? (
            <input
              aria-label={`${name} enum values`}
              placeholder="Allowed values, comma separated"
              value={definition.values.join(", ")}
              onChange={(event) => update(name, {
                ...definition,
                values: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
              })}
            />
          ) : null}
          <label className="contract-required">
            <input
              type="checkbox"
              checked={definition.required}
              onChange={(event) => update(name, { ...definition, required: event.target.checked })}
            />
            Required
          </label>
        </div>
      ))}
    </section>
  );
}
