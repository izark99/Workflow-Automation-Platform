import type * as React from 'react';

export type IconName =
  | 'check' | 'x' | 'chevron-down' | 'chevron-up' | 'chevron-left' | 'chevron-right' | 'chevrons-up-down'
  | 'calendar' | 'calendar-days' | 'search' | 'plus' | 'minus' | 'trash-2' | 'pencil' | 'download' | 'upload'
  | 'filter' | 'list-filter' | 'ellipsis' | 'info' | 'triangle-alert' | 'circle-alert' | 'circle-check' | 'circle-x'
  | 'loader-circle' | 'house' | 'users' | 'user' | 'settings' | 'bell' | 'file-spreadsheet' | 'workflow' | 'play'
  | 'chart-column' | 'trending-up' | 'trending-down' | 'arrow-up' | 'arrow-down' | 'log-out' | 'menu' | 'eye'
  | 'copy' | 'refresh-cw' | 'inbox' | 'clock' | 'wallet' | 'briefcase';
export type Tone = 'info' | 'success' | 'warning' | 'danger';
export type Size = 'sm' | 'md' | 'lg';

export interface IconProps { name: IconName; size?: number; strokeWidth?: number; label?: string; spin?: boolean; className?: string; style?: React.CSSProperties }
export declare function Icon(props: IconProps): React.ReactElement;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary: one per view. secondary: default. ghost: toolbars and cancel. danger: destructive. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** sm 32px, md 40px, lg 48px (mobile). */
  size?: Size;
  icon?: IconName; iconRight?: IconName; loading?: boolean; block?: boolean; as?: string; href?: string;
}
export declare function Button(props: ButtonProps): React.ReactElement;

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName; /** Accessible name and tooltip. */ label: string;
  variant?: 'ghost' | 'secondary' | 'primary' | 'danger'; size?: Size; tooltip?: boolean;
}
export declare function IconButton(props: IconButtonProps): React.ReactElement;

export interface SpinnerProps { size?: number; label?: string }
export declare function Spinner(props: SpinnerProps): React.ReactElement;

interface FieldProps { label?: React.ReactNode; helper?: React.ReactNode; error?: React.ReactNode; required?: boolean; size?: 'sm' | 'lg'; className?: string; style?: React.CSSProperties; id?: string; disabled?: boolean }

export interface TextFieldProps extends FieldProps, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  icon?: IconName; suffix?: React.ReactNode; multiline?: boolean; rows?: number; onValueChange?(value: string): void;
}
export declare function TextField(props: TextFieldProps): React.ReactElement;

export interface SelectOption { value: string | number; label: string; icon?: IconName; disabled?: boolean }
export interface SelectProps extends FieldProps {
  options: SelectOption[]; value?: string | number; defaultValue?: string | number;
  onChange?(value: string | number, option: SelectOption): void; placeholder?: string; icon?: IconName; defaultOpen?: boolean;
}
export declare function Select(props: SelectProps): React.ReactElement;

export interface DatePickerProps extends FieldProps {
  /** ISO date "YYYY-MM-DD"; shown as dd/mm/yyyy. */
  value?: string | null; defaultValue?: string | null; onChange?(value: string | null): void;
  locale?: 'vi' | 'en'; placeholder?: string; clearable?: boolean; defaultOpen?: boolean;
}
export declare function DatePicker(props: DatePickerProps): React.ReactElement;

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode; description?: React.ReactNode; indeterminate?: boolean; onCheckedChange?(checked: boolean): void;
}
export declare function Checkbox(props: CheckboxProps): React.ReactElement;

export interface RadioGroupProps { options: { value: string; label: React.ReactNode; disabled?: boolean }[]; value?: string; defaultValue?: string; onChange?(value: string): void; label?: string; name?: string; inline?: boolean; className?: string }
export declare function RadioGroup(props: RadioGroupProps): React.ReactElement;

export interface SwitchProps { label?: React.ReactNode; checked?: boolean; defaultChecked?: boolean; onChange?(checked: boolean): void; disabled?: boolean; id?: string; className?: string }
export declare function Switch(props: SwitchProps): React.ReactElement;

export interface CardProps extends React.HTMLAttributes<HTMLElement> { title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; flat?: boolean; inset?: boolean; interactive?: boolean; bodyStyle?: React.CSSProperties }
export declare function Card(props: CardProps): React.ReactElement;

export interface KpiTileProps {
  label: React.ReactNode; /** Pre-formatted, e.g. "3.024". */ value?: React.ReactNode; unit?: React.ReactNode;
  delta?: number; deltaLabel?: React.ReactNode; /** false for cost, turnover, overtime. */ positiveIsGood?: boolean;
  period?: React.ReactNode; loading?: boolean; className?: string;
}
export declare function KpiTile(props: KpiTileProps): React.ReactElement;

export interface BadgeProps { tone?: 'neutral' | 'primary' | 'accent' | Tone; dot?: boolean; icon?: IconName | false; children?: React.ReactNode; className?: string }
export declare function Badge(props: BadgeProps): React.ReactElement;

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { selected?: boolean; onRemove?(): void; icon?: IconName }
export declare function Chip(props: ChipProps): React.ReactElement;

export interface AvatarProps { name: string; src?: string; size?: Size; className?: string }
export declare function Avatar(props: AvatarProps): React.ReactElement;

export interface ProgressBarProps { value?: number; max?: number; label?: React.ReactNode; valueLabel?: React.ReactNode; className?: string }
export declare function ProgressBar(props: ProgressBarProps): React.ReactElement;

export interface SkeletonProps { variant?: 'block' | 'text' | 'title' | 'circle'; lines?: number; width?: number | string; height?: number | string; size?: number; radius?: string; style?: React.CSSProperties; className?: string }
export declare function Skeleton(props: SkeletonProps): React.ReactElement;

export interface TableColumn<Row> {
  key: string; header: React.ReactNode; align?: 'left' | 'right'; width?: string; sortable?: boolean; nowrap?: boolean;
  sortValue?(row: Row): string | number; render?(row: Row): React.ReactNode;
}
export interface TableProps<Row = any> {
  columns: TableColumn<Row>[]; rows: Row[]; rowKey?(row: Row, index: number): string | number;
  sort?: { key: string; dir: 'asc' | 'desc' } | null; defaultSort?: { key: string; dir: 'asc' | 'desc' }; onSortChange?(sort: { key: string; dir: 'asc' | 'desc' } | null): void;
  selectable?: boolean; selected?: (string | number)[]; onSelectedChange?(keys: (string | number)[]): void;
  loading?: boolean; skeletonRows?: number; empty?: React.ReactNode; dense?: boolean; maxHeight?: number | string;
  onRowClick?(row: Row): void; caption?: string; className?: string;
}
export declare function Table<Row>(props: TableProps<Row>): React.ReactElement;

export interface PaginationProps { page: number; pageCount: number; onChange?(page: number): void; summary?: React.ReactNode; className?: string }
export declare function Pagination(props: PaginationProps): React.ReactElement;

export interface AlertProps { tone?: Tone; title?: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode; onClose?(): void; className?: string }
export declare function Alert(props: AlertProps): React.ReactElement;

export interface ToastOptions { title: React.ReactNode; text?: React.ReactNode; tone?: Tone; action?: { label: string; onClick(): void }; /** ms, default 5000, 0 = sticky */ duration?: number }
export interface ToasterProps { inline?: boolean }
export declare function Toaster(props: ToasterProps): React.ReactElement;
export declare function toast(options: ToastOptions | string): number;
export declare function dismissToast(id: number): void;

export interface TooltipProps { content: React.ReactNode; children: React.ReactElement }
export declare function Tooltip(props: TooltipProps): React.ReactElement;

export interface DialogProps { open: boolean; onClose?(): void; title: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; width?: number; tone?: 'danger'; dismissible?: boolean; contained?: boolean; autoFocus?: boolean }
export declare function Dialog(props: DialogProps): React.ReactElement | null;
export interface SheetProps { open: boolean; onClose?(): void; title: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; contained?: boolean; autoFocus?: boolean }
export declare function Sheet(props: SheetProps): React.ReactElement | null;

export interface TabItem { value: string; label: React.ReactNode; count?: number }
export interface TabsProps { items: TabItem[]; value?: string; defaultValue?: string; onChange?(value: string): void; label?: string; className?: string }
export declare function Tabs(props: TabsProps): React.ReactElement;
export interface SegmentedControlProps extends TabsProps {}
export declare function SegmentedControl(props: SegmentedControlProps): React.ReactElement;

export interface MenuItem { label: string; icon?: IconName; shortcut?: string; danger?: boolean; disabled?: boolean; onSelect?(): void }
export interface MenuProps { items: (MenuItem | 'separator')[]; trigger?: React.ReactElement; label?: string; align?: 'start' | 'end'; defaultOpen?: boolean }
export declare function Menu(props: MenuProps): React.ReactElement;

export interface BreadcrumbsProps { items: { label: React.ReactNode; href?: string; onClick?(e: React.MouseEvent): void }[] }
export declare function Breadcrumbs(props: BreadcrumbsProps): React.ReactElement;

export interface NavItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> { icon?: IconName; label: React.ReactNode; active?: boolean; badge?: React.ReactNode }
export declare function NavItem(props: NavItemProps): React.ReactElement;

export interface SidebarProps { brand?: React.ReactNode; sections: { title?: string; items: { value: string; label: string; icon: IconName; badge?: React.ReactNode }[] }[]; value?: string; onChange?(value: string): void; footer?: React.ReactNode; className?: string; style?: React.CSSProperties }
export declare function Sidebar(props: SidebarProps): React.ReactElement;

export interface TopBarProps { title: React.ReactNode; breadcrumbs?: BreadcrumbsProps['items']; actions?: React.ReactNode; className?: string }
export declare function TopBar(props: TopBarProps): React.ReactElement;

export interface AppBarProps { title: React.ReactNode; onBack?(): void; backLabel?: string; actions?: React.ReactNode; large?: boolean; className?: string }
export declare function AppBar(props: AppBarProps): React.ReactElement;

export interface BottomNavProps { items: { value: string; label: string; icon: IconName }[]; value?: string; onChange?(value: string): void; className?: string }
export declare function BottomNav(props: BottomNavProps): React.ReactElement;

export interface ListItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { title: React.ReactNode; subtitle?: React.ReactNode; leading?: React.ReactNode; meta?: React.ReactNode; chevron?: boolean }
export declare function ListItem(props: ListItemProps): React.ReactElement;

export interface EmptyStateProps { icon?: IconName; title: React.ReactNode; text?: React.ReactNode; actions?: React.ReactNode; className?: string }
export declare function EmptyState(props: EmptyStateProps): React.ReactElement;

declare global {
  interface Window {
    Harold: {
      Icon: typeof Icon & { names: IconName[] }; Button: typeof Button; IconButton: typeof IconButton; Spinner: typeof Spinner;
      TextField: typeof TextField; Select: typeof Select; DatePicker: typeof DatePicker; Checkbox: typeof Checkbox; RadioGroup: typeof RadioGroup; Switch: typeof Switch;
      Card: typeof Card; KpiTile: typeof KpiTile; Badge: typeof Badge; Chip: typeof Chip; Avatar: typeof Avatar; ProgressBar: typeof ProgressBar; Skeleton: typeof Skeleton;
      Table: typeof Table; Pagination: typeof Pagination; Alert: typeof Alert; Toaster: typeof Toaster; toast: typeof toast; dismissToast: typeof dismissToast;
      Tooltip: typeof Tooltip; Dialog: typeof Dialog; Sheet: typeof Sheet; Tabs: typeof Tabs; SegmentedControl: typeof SegmentedControl; Menu: typeof Menu;
      Breadcrumbs: typeof Breadcrumbs; Sidebar: typeof Sidebar; NavItem: typeof NavItem; TopBar: typeof TopBar; AppBar: typeof AppBar; BottomNav: typeof BottomNav;
      ListItem: typeof ListItem; EmptyState: typeof EmptyState; formatDate(date: Date): string;
    };
  }
}
