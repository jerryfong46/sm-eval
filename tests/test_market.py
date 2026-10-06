import unittest
from api.market import summarize_chart, market_data

class MarketTests(unittest.TestCase):
    def chart(self):
        end = 1700000000
        year = 365.25 * 86400
        return {'meta': {'currency': 'CAD'},
                'timestamp': [end - 5*year - 86400, end - year, end],
                'indicators': {'quote': [{'close': [50, 100, 110]}], 'adjclose': [{'adjclose': [20, 70, 110]}]},
                'events': {'dividends': {'1': {'date': end - 100*86400, 'amount': 2},
                                          '2': {'date': end - 400*86400, 'amount': 9}}}}
    def test_price_return_does_not_include_dividends(self):
        data = summarize_chart(self.chart(), 'VFV')
        self.assertAlmostEqual(data['priceReturns']['1'], .1)
        self.assertAlmostEqual(data['dividendYield'], 2/110)
        self.assertNotIn('10', data['priceReturns'])
    def test_splits_adjust_cash_distributions(self):
        chart = self.chart()
        chart['events']['splits'] = {'1': {'date': 1700000000-10*86400, 'numerator': 2, 'denominator': 1}}
        self.assertAlmostEqual(summarize_chart(chart, 'VFV')['dividendYield'], 1/110)
    def test_missing_last_close(self):
        chart = self.chart()
        chart['indicators']['quote'][0]['close'][-1] = None
        data = summarize_chart(chart, 'VFV')
        self.assertEqual(data['price'], 100)
    def test_non_cad_rejected(self):
        chart = self.chart()
        chart['meta']['currency'] = 'USD'
        with self.assertRaises(ValueError): summarize_chart(chart, 'VFV')
    def test_unknown_symbol_rejected_before_network(self):
        with self.assertRaises(ValueError): market_data('../../secret')

if __name__ == '__main__': unittest.main()
