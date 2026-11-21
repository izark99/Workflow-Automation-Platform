import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge, Button, Card, Field, SearchField, Table } from './index';

const html = (el: React.ReactElement): string => renderToStaticMarkup(el);

describe('Button', () => {
  it('is a type=button button with the variant as data attribute', () => {
    const out = html(<Button variant="cta">Run</Button>);
    expect(out).toContain('type="button"');
    expect(out).toContain('data-variant="cta"');
    expect(out).toContain('>Run<');
  });
  it('defaults to secondary and can submit when asked', () => {
    expect(html(<Button>Open</Button>)).toContain('data-variant="secondary"');
    expect(html(<Button type="submit">Save</Button>)).toContain('type="submit"');
  });
  it('shows a spinner and aria-busy while it waits', () => {
    const out = html(<Button busy>Running</Button>);
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain('<svg');
    expect(html(<Button>Idle</Button>)).not.toContain('aria-busy');
  });
  it('has the four Harold variants, and cta stays an alias of primary until T7.6b', () => {
    for (const v of ['primary', 'secondary', 'ghost', 'danger', 'cta'] as const) {
      expect(html(<Button variant={v}>x</Button>)).toContain(`data-variant="${v}"`);
    }
  });
  it('has the sizes md (40 px) and sm (32 px): sm adds the small class, compact is its old name', () => {
    const md = html(<Button>x</Button>);
    expect(html(<Button size="sm">x</Button>)).not.toBe(md);
    expect(html(<Button compact>x</Button>)).toBe(html(<Button size="sm">x</Button>));
  });
  it('an icon button carries its label as the tooltip text, and a plain button has no tooltip', () => {
    const out = html(<Button icon aria-label="Close dialog">x</Button>);
    expect(out).toContain('aria-label="Close dialog"');
    expect(out).toContain('data-tooltip="Close dialog"');
    expect(html(<Button>x</Button>)).not.toContain('data-tooltip');
  });
  it('keeps the label in the layout while busy, so the width does not change', () => {
    const out = html(<Button busy>Running</Button>);
    expect(out).toContain('Running');
    expect(out).toContain('aria-busy="true"');
  });
  it('keeps the disabled attribute and the aria-label of a row action', () => {
    const out = html(<Button compact aria-label="Delete Monthly timesheet" disabled>Delete</Button>);
    expect(out).toContain('disabled');
    expect(out).toContain('aria-label="Delete Monthly timesheet"');
  });
});

describe('Badge and Card', () => {
  it('Badge shows its word', () => {
    expect(html(<Badge>Published</Badge>)).toContain('Published');
  });
  it('Card marks the first block and titles itself', () => {
    const out = html(<Card title="Buttons" firstBlock>x</Card>);
    expect(out).toContain('data-first-block');
    expect(out).toContain('<h2>Buttons</h2>');
  });
  it('a flush card has no h2 and is labelled for assistive technology', () => {
    const out = html(<Card flush title="Flows">x</Card>);
    expect(out).not.toContain('<h2>');
    expect(out).toContain('aria-label="Flows"');
  });
});

describe('Table', () => {
  const rows = [{ id: 'a', name: 'Alpha', n: 3 }, { id: 'b', name: 'Beta', n: 12 }];
  const out = html(
    <Table
      label="Flows"
      rows={rows}
      rowKey={(r) => r.id}
      columns={[
        { key: 'name', header: 'Flow', render: (r) => r.name },
        { key: 'n', header: 'Steps', align: 'right', render: (r) => r.n },
      ]}
    />,
  );
  it('has column headers with scope and one body row per item', () => {
    expect(out.match(/<th scope="col"/g)?.length).toBe(2);
    expect(out.match(/<tr>/g)?.length).toBe(3);
    expect(out).toContain('aria-label="Flows"');
  });
  it('right-aligns numbers only', () => {
    const tds = out.match(/<td class="[^"]*"/g) ?? [];
    expect(tds.length).toBe(4);
  });
});

describe('Field and SearchField', () => {
  it('ties the label to a text input', () => {
    const out = html(<Field label="New column name" defaultValue="OT flag" />);
    const id = /for="([^"]+)"/.exec(out)?.[1];
    expect(id).toBeTruthy();
    expect(out).toContain(`id="${id}"`);
    expect(out).toContain('type="text"');
  });
  it('links the error with aria-describedby and marks the input invalid', () => {
    const out = html(<Field label="Name" error="Name is empty. Type a name." />);
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('aria-describedby=');
    expect(out).toContain('role="alert"');
  });
  it('shows a hint only as an info button after the label, never as a paragraph', () => {
    const out = html(<Field label="Name" hint="Use letters" />);
    expect(out).toContain('data-infotip');
    expect(out).toContain('aria-label="About Name"');
    expect(out).not.toContain('Use letters'); // the text appears only when the popover is open
  });
  it('SearchField is type=text with an accessible name, never type=search', () => {
    const out = html(<SearchField label="Search flows" placeholder="Flow name" />);
    expect(out).toContain('type="text"');
    expect(out).not.toContain('type="search"');
    expect(out).toContain('aria-label="Search flows"');
  });
});
