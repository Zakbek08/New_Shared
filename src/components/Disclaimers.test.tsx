import { render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/theme/ThemeProvider';

import {
  DEMO_DATA_DISCLAIMER,
  DemoDataBanner,
  DISCLAIMER_VERSION,
  DisclaimerNotice,
  FINANCIAL_INFORMATION_DISCLAIMER,
  MerchantCodingWarning,
  NO_CREDENTIALS_DISCLAIMER,
  NO_PAYMENT_DISCLAIMER,
} from './Disclaimers';

const renderInTheme = (ui: React.ReactElement, scheme: 'light' | 'dark' = 'light') =>
  render(<ThemeProvider initialPreference={scheme}>{ui}</ThemeProvider>);

describe('disclaimer copy', () => {
  it('says the app gives estimates rather than financial advice', () => {
    expect(FINANCIAL_INFORMATION_DISCLAIMER).toMatch(/estimates, not financial advice/i);
  });

  it('says the app never makes a payment', () => {
    expect(NO_PAYMENT_DISCLAIMER).toMatch(/never makes a payment/i);
    expect(NO_PAYMENT_DISCLAIMER).toMatch(/bank/i);
  });

  it('names every credential the app refuses to ask for', () => {
    for (const term of [/card number/i, /security code/i, /PIN/, /password/i]) {
      expect(NO_CREDENTIALS_DISCLAIMER).toMatch(term);
    }
  });

  it('says demonstration rates are invented', () => {
    expect(DEMO_DATA_DISCLAIMER).toMatch(/fictional/i);
    expect(DEMO_DATA_DISCLAIMER).toMatch(/invented/i);
  });

  it('carries a version so acceptance can be recorded and re-requested', () => {
    expect(DISCLAIMER_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('DisclaimerNotice', () => {
  it('renders the financial disclaimer text', () => {
    renderInTheme(<DisclaimerNotice kind="financial" />);
    expect(screen.getByText(FINANCIAL_INFORMATION_DISCLAIMER)).toBeTruthy();
  });

  it('exposes the whole statement as one accessible label, not fragments', () => {
    renderInTheme(<DisclaimerNotice kind="no_payment" />);
    expect(screen.getByLabelText(NO_PAYMENT_DISCLAIMER)).toBeTruthy();
  });

  it('renders in compact form too', () => {
    renderInTheme(<DisclaimerNotice kind="no_credentials" compact />);
    expect(screen.getByText(NO_CREDENTIALS_DISCLAIMER)).toBeTruthy();
  });

  it('renders in dark mode', () => {
    renderInTheme(<DisclaimerNotice kind="financial" />, 'dark');
    expect(screen.getByText(FINANCIAL_INFORMATION_DISCLAIMER)).toBeTruthy();
  });
});

describe('MerchantCodingWarning', () => {
  it('carries a text label, so the amber colour is not the only signal', () => {
    renderInTheme(<MerchantCodingWarning />);
    expect(screen.getByText('Coding uncertain')).toBeTruthy();
  });

  it('names the merchant when one was resolved', () => {
    renderInTheme(<MerchantCodingWarning merchantName="BulkBarn Warehouse" />);
    expect(screen.getByText(/BulkBarn Warehouse/)).toBeTruthy();
  });

  it('still explains itself when no merchant was resolved', () => {
    renderInTheme(<MerchantCodingWarning />);
    expect(screen.getByText(/issuer decides/i)).toBeTruthy();
  });
});

describe('DemoDataBanner', () => {
  it('is unmistakable about showing fictional data', () => {
    renderInTheme(<DemoDataBanner />);
    expect(screen.getByText('DEMO DATA')).toBeTruthy();
    expect(screen.getByText(DEMO_DATA_DISCLAIMER)).toBeTruthy();
  });
});
