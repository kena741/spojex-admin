import Link from "next/link";
import { CalendarCheck, Coins, Package, Wallet } from "lucide-react";
import {
  PersonEmptyState,
  PersonPanel,
  PersonSection,
  PersonStatRow,
} from "@/components/people/person-section";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { firstPayment } from "@/lib/marketplace";
import type {
  CoinWalletRow,
  ServiceRequestRow,
  ServiceRow,
  WalletRow,
  WithdrawalRow,
} from "@/lib/types";
import { formatCoins, formatDate, formatMoney, formatStatusLabel } from "@/lib/utils";

export interface Props {
  userId: string;
  services: ServiceRow[];
  bookings: ServiceRequestRow[];
  wallet: WalletRow | null;
  withdrawals: WithdrawalRow[];
  coinWallet: CoinWalletRow | null;
  /** id of the service being mutated, or "all" during a bulk approve. */
  busyService: string | null;
  onToggleService: (row: ServiceRow, published: boolean) => void;
  onDeleteService: (row: ServiceRow) => void;
  onApproveAll: () => void;
}

export function PersonMarketplaceSection({
  userId,
  services,
  bookings,
  wallet,
  withdrawals,
  coinWallet,
  busyService,
  onToggleService,
  onDeleteService,
  onApproveAll,
}: Props) {
  const pendingCount = services.filter((service) => !service.published).length;

  return (
    <PersonSection
      id="marketplace"
      title="Marketplace"
      description="Services, bookings and money tied to this account."
    >
      <div className="@container">
        <div className="grid gap-3 @lg:grid-cols-2 @lg:items-start">
          <PersonPanel
            title="Services"
            count={services.length}
            action={
              pendingCount > 0 ? (
                <button
                  type="button"
                  disabled={busyService === "all"}
                  onClick={onApproveAll}
                  className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                >
                  Approve {pendingCount} pending
                </button>
              ) : null
            }
          >
            {services.length === 0 ? (
              <PersonEmptyState icon={Package} title="No services listed." compact />
            ) : (
              <ul className="space-y-3">
                {services.map((service) => (
                  <ServiceItem
                    key={service.id}
                    service={service}
                    busy={busyService === service.id}
                    onToggle={onToggleService}
                    onDelete={onDeleteService}
                  />
                ))}
              </ul>
            )}
          </PersonPanel>

          <PersonPanel title="Bookings" count={bookings.length}>
            {bookings.length === 0 ? (
              <PersonEmptyState icon={CalendarCheck} title="No bookings for this person." compact />
            ) : (
              <ul className="space-y-3">
                {bookings.map((row) => (
                  <BookingItem key={row.id} row={row} userId={userId} />
                ))}
              </ul>
            )}
          </PersonPanel>

          <PersonPanel
            title="Wallet"
            action={
              <Link href="/admin/wallets" className="text-xs font-medium text-primary hover:underline">
                All wallets
              </Link>
            }
          >
            {wallet ? (
              <dl className="space-y-1.5">
                <PersonStatRow
                  label="Available"
                  value={formatMoney(wallet.available, wallet.currency)}
                  strong
                />
                <PersonStatRow
                  label="Lifetime earned"
                  value={formatMoney(wallet.lifetime_earned, wallet.currency)}
                />
                <PersonStatRow label="Updated" value={formatDate(wallet.updated_at)} />
              </dl>
            ) : (
              <PersonEmptyState
                icon={Wallet}
                title="No wallet yet."
                hint="Created after the first completed paid booking."
                compact
              />
            )}
            <h4 className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-text-hint">
              Withdrawals
            </h4>
            {withdrawals.length === 0 ? (
              <p className="text-xs text-text-secondary">No withdrawal requests.</p>
            ) : (
              <ul className="space-y-2">
                {withdrawals.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      {formatMoney(row.amount)} · {row.bank_name}
                    </span>
                    <StatusBadge tone={requestTone(row.status)}>
                      {formatStatusLabel(row.status)}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </PersonPanel>

          <PersonPanel
            title="Coin gifts"
            action={
              <Link
                href="/admin/coin-catalog"
                className="text-xs font-medium text-primary hover:underline"
              >
                Gift catalog
              </Link>
            }
          >
            {coinWallet ? (
              <dl className="space-y-1.5">
                <PersonStatRow
                  label="Redeemable"
                  value={formatCoins(coinWallet.redeemable_balance)}
                  strong
                />
                <PersonStatRow
                  label="Received balance"
                  value={formatCoins(coinWallet.received_balance)}
                />
                <PersonStatRow
                  label="Purchased balance"
                  value={formatCoins(coinWallet.purchased_balance)}
                />
                <PersonStatRow
                  label="Gifts received"
                  value={formatCoins(coinWallet.lifetime_received)}
                />
                <PersonStatRow
                  label="Gifts sent"
                  value={formatCoins(coinWallet.lifetime_gifted)}
                />
              </dl>
            ) : (
              <PersonEmptyState
                icon={Coins}
                title="No coin wallet yet."
                hint="Appears after the first gift or purchase."
                compact
              />
            )}
          </PersonPanel>
        </div>
      </div>
    </PersonSection>
  );
}

interface ServiceItemProps {
  service: ServiceRow;
  busy: boolean;
  onToggle: (row: ServiceRow, published: boolean) => void;
  onDelete: (row: ServiceRow) => void;
}

function ServiceItem({ service, busy, onToggle, onDelete }: ServiceItemProps) {
  const images = Array.isArray(service.images)
    ? service.images.filter((item) => typeof item === "string")
    : [];
  const cover = (typeof images[0] === "string" && images[0]) || service.cover_url || "";
  const meta =
    [
      service.city,
      service.price_amount == null
        ? formatStatusLabel(service.pricing_type)
        : formatMoney(service.price_amount, service.currency || "ETB"),
    ]
      .filter(Boolean)
      .join(" · ") || "No location or price set";

  return (
    <li className="flex gap-3">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="h-12 w-16 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="grid h-12 w-16 shrink-0 place-items-center rounded-md bg-muted text-[10px] text-text-hint">
          No photo
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/admin/services/${service.id}`}
            className="min-w-0 truncate text-sm font-medium text-primary hover:underline"
          >
            {service.title}
          </Link>
          <StatusBadge tone={service.published ? "success" : "warning"}>
            {service.published ? "Approved" : "Pending"}
          </StatusBadge>
        </div>
        <p className="truncate text-xs text-text-secondary">{meta}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            disabled={busy}
            onClick={() => onToggle(service, !service.published)}
            className="font-medium text-primary hover:underline disabled:opacity-50"
          >
            {service.published ? "Unpublish" : "Approve"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(service)}
            className="font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

interface BookingItemProps {
  row: ServiceRequestRow;
  userId: string;
}

function BookingItem({ row, userId }: BookingItemProps) {
  const payment = firstPayment(row.service_payments);
  const isProvider = row.provider_id === userId;
  const otherId = isProvider ? row.requester_id : row.provider_id;
  const otherName = isProvider
    ? row.requester?.display_name || "Customer"
    : row.provider?.display_name || "Provider";

  return (
    <li className="min-w-0">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/admin/services/${row.service_id}`}
          className="min-w-0 truncate text-sm font-medium text-primary hover:underline"
        >
          {row.services?.title || "Service"}
        </Link>
        <StatusBadge tone={requestTone(row.status)}>{formatStatusLabel(row.status)}</StatusBadge>
      </div>
      <p className="truncate text-xs text-text-secondary">
        {isProvider ? "From" : "Booked with"}{" "}
        <Link href={`/admin/people/${otherId}`} className="text-primary hover:underline">
          {otherName}
        </Link>
      </p>
      {payment ? (
        <p className="text-xs text-text-hint">
          {formatMoney(payment.amount, payment.currency)} · {formatStatusLabel(payment.status)}
        </p>
      ) : null}
    </li>
  );
}
