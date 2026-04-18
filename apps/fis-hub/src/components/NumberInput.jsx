import React, { useState } from 'react';

/**
 * A number input that displays formatted (comma-separated) numbers when not focused,
 * and a raw number input when focused for editing.
 */
const NumberInputWithCommas = ({ value, onChange, style, title, step }) => {
  const [focused, setFocused] = useState(false);
  const rawValue = value !== undefined && value !== null ? value : '';
  const displayValue = focused ? rawValue : (rawValue !== '' ? Number(rawValue).toLocaleString() : '');

  return (
    <input
      type={focused ? "number" : "text"}
      step={step}
      value={displayValue}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={e => onChange(e.target.value)}
      style={style}
      title={title}
    />
  );
};

export default NumberInputWithCommas;
