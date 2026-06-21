import { OrdersService } from '../src/modules/orders/orders.service';

describe('OrdersService.profit', () => {
  // profit() is a pure function; construct the service with stubbed dependencies.
  const service = new OrdersService(
    null as never,
    null as never,
    null as never,
  );

  it('computes revenue minus cost of goods sold', () => {
    const order = {
      subtotalCents: 5998, // 2 units * 2999
      items: [{ unitCostCents: 1200, quantity: 2 }],
    };
    expect(service.profit(order)).toBe(5998 - 2400);
  });

  it('returns zero profit when cost equals revenue', () => {
    const order = {
      subtotalCents: 2400,
      items: [{ unitCostCents: 1200, quantity: 2 }],
    };
    expect(service.profit(order)).toBe(0);
  });
});
