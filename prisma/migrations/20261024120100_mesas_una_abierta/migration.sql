-- Una sola cuenta abierta por mesa: dos camareros que abren la misma mesa a la
-- vez no pueden crear dos cuentas. (Va aparte porque usa el valor nuevo OPEN.)
CREATE UNIQUE INDEX "Order_open_table_key" ON "Order"("tableId") WHERE "status" = 'OPEN';
