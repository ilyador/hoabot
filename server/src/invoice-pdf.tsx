import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#1A1F36' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  hoaName: { fontSize: 16, fontWeight: 'bold', fontFamily: 'Helvetica-Bold', color: '#1A1F36' },
  hoaAddress: { fontSize: 9, color: '#697386', marginTop: 2 },
  invoiceTitle: { fontSize: 20, fontWeight: 'bold', fontFamily: 'Helvetica-Bold', color: '#635BFF', textAlign: 'right' },
  invoiceMeta: { fontSize: 9, color: '#697386', textAlign: 'right', marginTop: 2 },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', fontFamily: 'Helvetica-Bold', marginBottom: 8, color: '#1A1F36', borderBottom: '1 solid #E3E8EF', paddingBottom: 4 },

  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  label: { fontSize: 9, color: '#697386' },
  value: { fontSize: 10, color: '#1A1F36' },

  summaryBox: { backgroundColor: '#F7F8FA', borderRadius: 4, padding: 16, marginBottom: 20, border: '1 solid #E3E8EF' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  summaryTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 8, borderTop: '2 solid #1A1F36' },
  summaryTotalLabel: { fontSize: 12, fontWeight: 'bold', fontFamily: 'Helvetica-Bold', color: '#1A1F36' },
  summaryTotalValue: { fontSize: 14, fontWeight: 'bold', fontFamily: 'Helvetica-Bold', color: '#635BFF' },

  table: { marginBottom: 20 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F7F8FA', borderBottom: '1 solid #E3E8EF', paddingVertical: 6, paddingHorizontal: 8 },
  tableRow: { flexDirection: 'row', borderBottom: '1 solid #F0F0F0', paddingVertical: 6, paddingHorizontal: 8 },
  tableColDesc: { flex: 3, fontSize: 9 },
  tableColType: { flex: 1, fontSize: 9, color: '#697386' },
  tableColAmount: { flex: 1, fontSize: 9, textAlign: 'right' },
  tableHeaderText: { fontSize: 8, fontWeight: 'bold', fontFamily: 'Helvetica-Bold', color: '#697386', textTransform: 'uppercase', letterSpacing: 0.5 },

  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, fontSize: 9, fontWeight: 'bold', fontFamily: 'Helvetica-Bold' },
  statusPending: { backgroundColor: '#FFF3E0', color: '#ED6704' },
  statusPaid: { backgroundColor: '#E8F5E9', color: '#30B130' },
  statusOverdue: { backgroundColor: '#FFEBEE', color: '#DF1B41' },

  footer: { position: 'absolute', bottom: 40, left: 40, right: 40, borderTop: '1 solid #E3E8EF', paddingTop: 12 },
  footerText: { fontSize: 8, color: '#A3ACB9', textAlign: 'center' },

  paymentBox: { backgroundColor: '#F0EDFF', borderRadius: 4, padding: 12, marginBottom: 20, border: '1 solid #D6D0FF' },
  paymentTitle: { fontSize: 10, fontWeight: 'bold', fontFamily: 'Helvetica-Bold', color: '#635BFF', marginBottom: 4 },
  paymentText: { fontSize: 9, color: '#4A4580' },

  dueBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF8F0', borderRadius: 4, padding: 12, marginBottom: 20, border: '1 solid #FFE0B2' },
  overdueBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF0F0', borderRadius: 4, padding: 12, marginBottom: 20, border: '1 solid #FFCDD2' },
});

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

const typeLabels: Record<string, string> = {
  assessment: 'Assessment',
  special_assessment: 'Special',
  late_fee: 'Late Fee',
  fine: 'Fine',
  credit: 'Credit',
};

interface InvoiceData {
  invoiceNumber: number;
  status: string;
  createdAt: Date | string;
  dueDate: Date | string;
  paidAt?: Date | string | null;
  amount: number;
  lateFeeAmount: number;
  description: string;
  billingPeriod?: string | null;
  hoa: { name: string; address?: string | null; phone?: string | null; email?: string | null };
  unit: { address: string; lotNumber?: string | null; ownerName?: string | null; ownerEmail?: string | null };
  lineItems: { description: string; amount: number; type: string }[];
  // Account summary
  previousBalance?: number;
  paymentsReceived?: number;
}

function InvoiceDocument({ data }: { data: InvoiceData }) {
  const hasLineItems = data.lineItems.length > 0;
  const totalCharges = hasLineItems ? data.lineItems.reduce((sum, li) => sum + li.amount, 0) : data.amount;
  const previousBalance = data.previousBalance || 0;
  const paymentsReceived = data.paymentsReceived || 0;
  const currentBalance = previousBalance + totalCharges - paymentsReceived;

  const statusStyle = data.status === 'paid' ? styles.statusPaid
    : data.status === 'overdue' ? styles.statusOverdue
    : styles.statusPending;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.hoaName}>{data.hoa.name}</Text>
            {data.hoa.address && <Text style={styles.hoaAddress}>{data.hoa.address}</Text>}
            {data.hoa.phone && <Text style={styles.hoaAddress}>{data.hoa.phone}</Text>}
            {data.hoa.email && <Text style={styles.hoaAddress}>{data.hoa.email}</Text>}
          </View>
          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceMeta}>#{String(data.invoiceNumber).padStart(5, '0')}</Text>
            <Text style={styles.invoiceMeta}>Date: {fmtDate(data.createdAt)}</Text>
            <View style={[styles.statusBadge, statusStyle, { marginTop: 6, alignSelf: 'flex-end' }]}>
              <Text>{data.status.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* Bill To */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill To</Text>
          <View style={styles.row}>
            <View>
              <Text style={styles.value}>{data.unit.ownerName || 'Homeowner'}</Text>
              <Text style={{ ...styles.label, marginTop: 2 }}>{data.unit.address}</Text>
              {data.unit.lotNumber && <Text style={styles.label}>Lot #{data.unit.lotNumber}</Text>}
              {data.unit.ownerEmail && <Text style={styles.label}>{data.unit.ownerEmail}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={styles.row}>
                <Text style={styles.label}>Due Date: </Text>
                <Text style={{ ...styles.value, fontWeight: 'bold', fontFamily: 'Helvetica-Bold' }}>{fmtDate(data.dueDate)}</Text>
              </View>
              {data.billingPeriod && (
                <View style={styles.row}>
                  <Text style={styles.label}>Period: </Text>
                  <Text style={styles.value}>{data.billingPeriod}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Due/Overdue notice */}
        {data.status === 'overdue' && (
          <View style={styles.overdueBox}>
            <Text style={{ fontSize: 10, fontWeight: 'bold', fontFamily: 'Helvetica-Bold', color: '#DF1B41' }}>PAST DUE</Text>
            <Text style={{ fontSize: 10, color: '#DF1B41' }}>Please remit payment immediately to avoid additional fees.</Text>
          </View>
        )}
        {data.status === 'pending' && (
          <View style={styles.dueBox}>
            <Text style={{ fontSize: 9, color: '#ED6704' }}>Payment due by {fmtDate(data.dueDate)}. Late fees may apply after the grace period.</Text>
          </View>
        )}

        {/* Line Items Table */}
        <View style={styles.table}>
          <Text style={styles.sectionTitle}>Charges</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.tableColDesc]}>Description</Text>
            <Text style={[styles.tableHeaderText, styles.tableColType]}>Type</Text>
            <Text style={[styles.tableHeaderText, styles.tableColAmount]}>Amount</Text>
          </View>
          {hasLineItems ? (
            data.lineItems.map((li, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={styles.tableColDesc}>{li.description}</Text>
                <Text style={styles.tableColType}>{typeLabels[li.type] || li.type}</Text>
                <Text style={[styles.tableColAmount, li.type === 'credit' ? { color: '#30B130' } : {}]}>
                  {li.type === 'credit' ? `-${fmt(li.amount)}` : fmt(li.amount)}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.tableRow}>
              <Text style={styles.tableColDesc}>{data.description}</Text>
              <Text style={styles.tableColType}>Assessment</Text>
              <Text style={styles.tableColAmount}>{fmt(data.amount)}</Text>
            </View>
          )}
          {data.lateFeeAmount > 0 && !hasLineItems && (
            <View style={styles.tableRow}>
              <Text style={styles.tableColDesc}>Late Fee</Text>
              <Text style={styles.tableColType}>Late Fee</Text>
              <Text style={[styles.tableColAmount, { color: '#DF1B41' }]}>{fmt(data.lateFeeAmount)}</Text>
            </View>
          )}
        </View>

        {/* Account Summary */}
        <View style={styles.summaryBox}>
          <Text style={{ ...styles.sectionTitle, border: 'none', paddingBottom: 0, marginBottom: 4 }}>Account Summary</Text>
          {previousBalance > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.label}>Previous Balance</Text>
              <Text style={styles.value}>{fmt(previousBalance)}</Text>
            </View>
          )}
          <View style={styles.summaryRow}>
            <Text style={styles.label}>New Charges</Text>
            <Text style={styles.value}>{fmt(totalCharges + data.lateFeeAmount)}</Text>
          </View>
          {paymentsReceived > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.label}>Payments Received</Text>
              <Text style={{ ...styles.value, color: '#30B130' }}>-{fmt(paymentsReceived)}</Text>
            </View>
          )}
          <View style={styles.summaryTotal}>
            <Text style={styles.summaryTotalLabel}>
              {data.status === 'paid' ? 'Amount Paid' : 'Total Due'}
            </Text>
            <Text style={styles.summaryTotalValue}>{fmt(data.status === 'paid' ? totalCharges + data.lateFeeAmount : currentBalance)}</Text>
          </View>
          {data.paidAt && (
            <View style={{ ...styles.summaryRow, marginTop: 4 }}>
              <Text style={styles.label}>Paid On</Text>
              <Text style={{ ...styles.value, color: '#30B130' }}>{fmtDate(data.paidAt)}</Text>
            </View>
          )}
        </View>

        {/* Payment Instructions */}
        {data.status !== 'paid' && (
          <View style={styles.paymentBox}>
            <Text style={styles.paymentTitle}>Payment Instructions</Text>
            <Text style={styles.paymentText}>
              Please make payment through the HOA online portal or contact {data.hoa.name} for alternative payment methods.
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {data.hoa.name} {data.hoa.address ? ` | ${data.hoa.address}` : ''}{data.hoa.phone ? ` | ${data.hoa.phone}` : ''}
          </Text>
          <Text style={{ ...styles.footerText, marginTop: 2 }}>
            Invoice #{String(data.invoiceNumber).padStart(5, '0')} | Generated by HOABot
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument data={data} />);
}
