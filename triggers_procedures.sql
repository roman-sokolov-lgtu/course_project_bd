CREATE OR REPLACE PROCEDURE book_trip(
    IN t_tourist_id INT,
    IN t_journey_id INT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_administrator_id INT;      
    v_trip_date DATE;            
    v_discount_amount INT;       
    v_base_price DECIMAL(10, 2);
    v_final_price DECIMAL(10, 2);
    v_discount_id INT;           
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM Tourist WHERE ID_tourist = t_tourist_id
    ) THEN
        RAISE EXCEPTION 'Турист с ID % не существует в базе!', t_tourist_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM Journey WHERE ID_journey = t_journey_id
    ) THEN
        RAISE EXCEPTION 'Путёвка с ID % не найдена в базе!', t_journey_id;
    END IF;

    SELECT a.ID_administrator
    INTO v_administrator_id
    FROM Administrator a
    WHERE a.Administrator_snp <> '0'
    ORDER BY (
        SELECT COUNT(*) FROM Trip tr WHERE tr.ID_administrator = a.ID_administrator
    ), a.ID_administrator
    LIMIT 1;

    IF v_administrator_id IS NULL THEN
        RAISE EXCEPTION 'Нет доступных администраторов для путёвки %', t_journey_id;
    END IF;

    SELECT MIN(Departure_date)
    INTO v_trip_date
    FROM Departure
    WHERE ID_journey = t_journey_id
      AND Departure_date > CURRENT_DATE;

    IF v_trip_date IS NULL THEN
        RAISE EXCEPTION 'Для путёвки с ID % нет доступных дат отправления!', t_journey_id;
    END IF;

    SELECT Journey_price
    INTO v_base_price
    FROM Journey
    WHERE ID_journey = t_journey_id;

    SELECT ID_discount, Discount_amount
    INTO v_discount_id, v_discount_amount
    FROM Discount
    WHERE ID_discount = (
        SELECT ID_discount FROM Tourist WHERE ID_tourist = t_tourist_id
    );

    IF v_discount_amount IS NOT NULL THEN
        v_final_price := v_base_price - (v_base_price * v_discount_amount / 100);
    ELSE
        v_final_price := v_base_price;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM Trip
        WHERE ID_tourist = t_tourist_id
          AND ID_journey = t_journey_id
          AND Trip_date = v_trip_date
    ) THEN
        RAISE EXCEPTION 'Турист с ID % уже забронировал эту поездку на дату %', t_tourist_id, v_trip_date;
    END IF;

    INSERT INTO Trip (
        ID_tourist, 
        ID_journey, 
        ID_administrator, 
        Booking_date, 
        Trip_date, 
        Booking_status, 
        final_price, 
        ID_discount
    ) VALUES (
        t_tourist_id, 
        t_journey_id, 
        v_administrator_id, 
        CURRENT_DATE, 
        v_trip_date, 
        1,  
        v_final_price, 
        v_discount_id
    );
END;
$$;


CREATE OR REPLACE FUNCTION assign_ first_trip_discount()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM Trip 
        WHERE Trip.ID_tourist = NEW.ID_tourist
    ) THEN
        NEW.ID_discount := 4;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_assign_discount
BEFORE INSERT ON Trip
FOR EACH ROW
EXECUTE FUNCTION assign_ first_trip_discount();


CREATE OR REPLACE FUNCTION prevent_status_update_after_confirmation()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.Booking_status = 2 AND OLD.Booking_status <> NEW.Booking_status THEN
        RAISE EXCEPTION 'Статус бронирования нельзя изменить после подтверждения!';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_status_change
BEFORE UPDATE ON Trip
FOR EACH ROW
EXECUTE FUNCTION prevent_status_update_after_confirmation();
