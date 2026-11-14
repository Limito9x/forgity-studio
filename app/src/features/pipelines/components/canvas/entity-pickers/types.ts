export interface EntityPickerProps {
  effectiveProjectId: string;
  value?: any;
  onChange: (value: any) => void;
  placeholder?: string;
  disabled?: boolean;
  multiple?: boolean;
}

