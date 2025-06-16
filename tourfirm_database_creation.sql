--
-- PostgreSQL database dump
--

-- Dumped from database version 17.2
-- Dumped by pg_dump version 17.2

-- Started on 2025-06-16 21:58:30

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 229 (class 1255 OID 32770)
-- Name: assign_first_trip_discount(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.assign_first_trip_discount() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    
    IF NOT EXISTS (SELECT 1 
                   FROM Trip 
                   WHERE Trip.ID_tourist = NEW.ID_tourist) THEN
        
        NEW.ID_discount := 4;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.assign_first_trip_discount() OWNER TO postgres;

--
-- TOC entry 245 (class 1255 OID 41101)
-- Name: book_trip(integer, integer); Type: PROCEDURE; Schema: public; Owner: postgres
--

CREATE PROCEDURE public.book_trip(IN t_tourist_id integer, IN t_journey_id integer)
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
    
    IF NOT EXISTS (SELECT 1 FROM Tourist WHERE ID_tourist = t_tourist_id) THEN
        RAISE EXCEPTION 'Турист с ID % не существует в базе!', t_tourist_id;
    END IF;

   
    IF NOT EXISTS (SELECT 1 FROM Journey WHERE ID_journey = t_journey_id) THEN
        RAISE EXCEPTION 'Путешествие с ID % не найдено в базе!', t_journey_id;
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

    
    SELECT MIN(Departure_date) INTO v_trip_date
    FROM Departure
    WHERE ID_journey = t_journey_id
      AND Departure_date > CURRENT_DATE;

    IF v_trip_date IS NULL THEN
        RAISE EXCEPTION 'Для путешествия с ID % нет доступных дат выезда!', t_journey_id;
    END IF;


    SELECT Journey_price INTO v_base_price
    FROM Journey
    WHERE ID_journey = t_journey_id;

    
    SELECT ID_discount, Discount_amount INTO v_discount_id, v_discount_amount
    FROM Discount
    WHERE ID_discount = (SELECT ID_discount FROM Tourist WHERE ID_tourist = t_tourist_id);

    
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
        RAISE EXCEPTION 'Турист с ID % уже забронировал поездку на это путешествие на %', t_tourist_id, v_trip_date;
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
    )
    VALUES (
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


ALTER PROCEDURE public.book_trip(IN t_tourist_id integer, IN t_journey_id integer) OWNER TO postgres;

--
-- TOC entry 244 (class 1255 OID 32788)
-- Name: prevent_status_update_after_confirmation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.prevent_status_update_after_confirmation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.Booking_status = 2 AND OLD.Booking_status <> NEW.Booking_status THEN
        RAISE EXCEPTION 'Статус бронирования нельзя изменить после подтверждения!';
    END IF;
    RETURN NEW;
END;

$$;


ALTER FUNCTION public.prevent_status_update_after_confirmation() OWNER TO postgres;

--
-- TOC entry 231 (class 1255 OID 41099)
-- Name: report(date, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.report(date_start date, date_end date) RETURNS TABLE("Путёвка" character varying, "Скидка" character varying, "Дата" date, "Выручка" numeric)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        j.Journey_name AS "Путёвка",
        d.Discount_name AS "Скидка",
        tr.Trip_date::date AS "Дата",
        SUM(j.Journey_price - d.Discount_amount) AS "Выручка"
    FROM Trip tr
    JOIN Journey j ON tr.ID_journey = j.ID_journey
    JOIN Discount d ON tr.ID_discount = d.ID_discount
    WHERE tr.Trip_date::date BETWEEN date_start AND date_end
      AND tr.Booking_status = 2 -- подтверждённые поездки
    GROUP BY j.Journey_name, d.Discount_name, tr.Trip_date::date
    ORDER BY tr.Trip_date::date, j.Journey_name;
END;
$$;


ALTER FUNCTION public.report(date_start date, date_end date) OWNER TO postgres;

--
-- TOC entry 230 (class 1255 OID 32793)
-- Name: test_raise_notice(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.test_raise_notice() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE NOTICE 'Test message';
END;
$$;


ALTER FUNCTION public.test_raise_notice() OWNER TO postgres;

--
-- TOC entry 232 (class 1255 OID 41103)
-- Name: tourists_without_trips(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.tourists_without_trips() RETURNS TABLE(tourist_name character varying, birthday date, phone character varying, email character varying, registration_date date)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.Tourist_snp,
        t.Tourist_birthday,
        t.Tourist_phone,
        t.Tourist_email,
        t.Registration_date
    FROM Tourist t
    WHERE t.ID_tourist NOT IN (
        SELECT tr.ID_tourist
        FROM Trip tr
    );
END;
$$;


ALTER FUNCTION public.tourists_without_trips() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 218 (class 1259 OID 16481)
-- Name: administrator; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.administrator (
    id_administrator integer NOT NULL,
    administrator_snp character varying(256),
    administrator_passport character varying(50),
    administrator_email character varying(100),
    administrator_phone character varying(30),
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'admin'::character varying NOT NULL
);


ALTER TABLE public.administrator OWNER TO postgres;

--
-- TOC entry 217 (class 1259 OID 16480)
-- Name: administartor_id_administrator_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.administartor_id_administrator_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.administartor_id_administrator_seq OWNER TO postgres;

--
-- TOC entry 4971 (class 0 OID 0)
-- Dependencies: 217
-- Name: administartor_id_administrator_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.administartor_id_administrator_seq OWNED BY public.administrator.id_administrator;


--
-- TOC entry 220 (class 1259 OID 16489)
-- Name: departure; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.departure (
    id_departure integer NOT NULL,
    id_journey integer NOT NULL,
    departure_date date NOT NULL
);


ALTER TABLE public.departure OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 16488)
-- Name: departure_id_departure_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.departure_id_departure_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.departure_id_departure_seq OWNER TO postgres;

--
-- TOC entry 4972 (class 0 OID 0)
-- Dependencies: 219
-- Name: departure_id_departure_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.departure_id_departure_seq OWNED BY public.departure.id_departure;


--
-- TOC entry 222 (class 1259 OID 16498)
-- Name: discount; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.discount (
    id_discount integer NOT NULL,
    discount_name character varying(100) NOT NULL,
    discount_amount integer NOT NULL
);


ALTER TABLE public.discount OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 16497)
-- Name: discount_id_discount_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.discount_id_discount_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.discount_id_discount_seq OWNER TO postgres;

--
-- TOC entry 4973 (class 0 OID 0)
-- Dependencies: 221
-- Name: discount_id_discount_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.discount_id_discount_seq OWNED BY public.discount.id_discount;


--
-- TOC entry 224 (class 1259 OID 16506)
-- Name: journey; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.journey (
    id_journey integer NOT NULL,
    id_administrator integer NOT NULL,
    journey_name character varying(100) NOT NULL,
    journey_country character varying(256) NOT NULL,
    journey_duration integer NOT NULL,
    journey_price numeric(10,2) NOT NULL
);


ALTER TABLE public.journey OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 16505)
-- Name: journey_id_journey_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.journey_id_journey_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.journey_id_journey_seq OWNER TO postgres;

--
-- TOC entry 4974 (class 0 OID 0)
-- Dependencies: 223
-- Name: journey_id_journey_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.journey_id_journey_seq OWNED BY public.journey.id_journey;


--
-- TOC entry 226 (class 1259 OID 16515)
-- Name: tourist; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tourist (
    id_tourist integer NOT NULL,
    id_discount integer,
    tourist_snp character varying(256) NOT NULL,
    tourist_birthday date NOT NULL,
    tourist_phone character varying(30) NOT NULL,
    tourist_email character varying(100),
    tourist_passport character varying(50) NOT NULL,
    registration_date date NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'tourist'::character varying NOT NULL
);


ALTER TABLE public.tourist OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 16514)
-- Name: tourist_id_tourist_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tourist_id_tourist_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tourist_id_tourist_seq OWNER TO postgres;

--
-- TOC entry 4975 (class 0 OID 0)
-- Dependencies: 225
-- Name: tourist_id_tourist_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tourist_id_tourist_seq OWNED BY public.tourist.id_tourist;


--
-- TOC entry 228 (class 1259 OID 16524)
-- Name: trip; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.trip (
    id_trip integer NOT NULL,
    id_discount integer,
    id_journey integer NOT NULL,
    id_administrator integer NOT NULL,
    id_tourist integer NOT NULL,
    booking_date date NOT NULL,
    booking_status smallint NOT NULL,
    confirmation_date date,
    trip_date date,
    final_price numeric(10,2)
);


ALTER TABLE public.trip OWNER TO postgres;

--
-- TOC entry 4976 (class 0 OID 0)
-- Dependencies: 228
-- Name: COLUMN trip.booking_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.trip.booking_status IS '1 - Ожидает подтверждения
2 - Подтверждён
3 - Отменён';


--
-- TOC entry 227 (class 1259 OID 16523)
-- Name: trip_id_trip_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.trip_id_trip_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.trip_id_trip_seq OWNER TO postgres;

--
-- TOC entry 4977 (class 0 OID 0)
-- Dependencies: 227
-- Name: trip_id_trip_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.trip_id_trip_seq OWNED BY public.trip.id_trip;


--
-- TOC entry 4773 (class 2604 OID 16484)
-- Name: administrator id_administrator; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.administrator ALTER COLUMN id_administrator SET DEFAULT nextval('public.administartor_id_administrator_seq'::regclass);


--
-- TOC entry 4775 (class 2604 OID 16492)
-- Name: departure id_departure; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departure ALTER COLUMN id_departure SET DEFAULT nextval('public.departure_id_departure_seq'::regclass);


--
-- TOC entry 4776 (class 2604 OID 16501)
-- Name: discount id_discount; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.discount ALTER COLUMN id_discount SET DEFAULT nextval('public.discount_id_discount_seq'::regclass);


--
-- TOC entry 4777 (class 2604 OID 16509)
-- Name: journey id_journey; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journey ALTER COLUMN id_journey SET DEFAULT nextval('public.journey_id_journey_seq'::regclass);


--
-- TOC entry 4778 (class 2604 OID 16518)
-- Name: tourist id_tourist; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tourist ALTER COLUMN id_tourist SET DEFAULT nextval('public.tourist_id_tourist_seq'::regclass);


--
-- TOC entry 4780 (class 2604 OID 16527)
-- Name: trip id_trip; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trip ALTER COLUMN id_trip SET DEFAULT nextval('public.trip_id_trip_seq'::regclass);


--
-- TOC entry 4783 (class 2606 OID 32914)
-- Name: administrator administrator_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.administrator
    ADD CONSTRAINT administrator_username_key UNIQUE (username);


--
-- TOC entry 4786 (class 2606 OID 16486)
-- Name: administrator pk_administartor; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.administrator
    ADD CONSTRAINT pk_administartor PRIMARY KEY (id_administrator);


--
-- TOC entry 4790 (class 2606 OID 16494)
-- Name: departure pk_departure; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departure
    ADD CONSTRAINT pk_departure PRIMARY KEY (id_journey, id_departure);


--
-- TOC entry 4793 (class 2606 OID 16503)
-- Name: discount pk_discount; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.discount
    ADD CONSTRAINT pk_discount PRIMARY KEY (id_discount);


--
-- TOC entry 4796 (class 2606 OID 16511)
-- Name: journey pk_journey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journey
    ADD CONSTRAINT pk_journey PRIMARY KEY (id_journey);


--
-- TOC entry 4801 (class 2606 OID 16520)
-- Name: tourist pk_tourist; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tourist
    ADD CONSTRAINT pk_tourist PRIMARY KEY (id_tourist);


--
-- TOC entry 4810 (class 2606 OID 16529)
-- Name: trip pk_trip; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trip
    ADD CONSTRAINT pk_trip PRIMARY KEY (id_trip);


--
-- TOC entry 4804 (class 2606 OID 32919)
-- Name: tourist tourist_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tourist
    ADD CONSTRAINT tourist_username_key UNIQUE (username);


--
-- TOC entry 4781 (class 1259 OID 16487)
-- Name: administartor_pk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX administartor_pk ON public.administrator USING btree (id_administrator);


--
-- TOC entry 4805 (class 1259 OID 16531)
-- Name: applies_fk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX applies_fk ON public.trip USING btree (id_discount);


--
-- TOC entry 4806 (class 1259 OID 16533)
-- Name: confirms_fk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX confirms_fk ON public.trip USING btree (id_administrator);


--
-- TOC entry 4787 (class 1259 OID 16495)
-- Name: departure_pk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX departure_pk ON public.departure USING btree (id_journey, id_departure);


--
-- TOC entry 4791 (class 1259 OID 16504)
-- Name: discount_pk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX discount_pk ON public.discount USING btree (id_discount);


--
-- TOC entry 4807 (class 1259 OID 16532)
-- Name: gets_fk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX gets_fk ON public.trip USING btree (id_journey);


--
-- TOC entry 4798 (class 1259 OID 16522)
-- Name: has_fk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX has_fk ON public.tourist USING btree (id_discount);


--
-- TOC entry 4784 (class 1259 OID 32922)
-- Name: idx_administrator_username; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_administrator_username ON public.administrator USING btree (username);


--
-- TOC entry 4799 (class 1259 OID 32923)
-- Name: idx_tourist_username; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tourist_username ON public.tourist USING btree (username);


--
-- TOC entry 4794 (class 1259 OID 16512)
-- Name: journey_pk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX journey_pk ON public.journey USING btree (id_journey);


--
-- TOC entry 4808 (class 1259 OID 16534)
-- Name: makes_fk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX makes_fk ON public.trip USING btree (id_tourist);


--
-- TOC entry 4788 (class 1259 OID 16496)
-- Name: occur_fk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX occur_fk ON public.departure USING btree (id_journey);


--
-- TOC entry 4797 (class 1259 OID 16513)
-- Name: publishes_fk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX publishes_fk ON public.journey USING btree (id_administrator);


--
-- TOC entry 4802 (class 1259 OID 16521)
-- Name: tourist_pk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX tourist_pk ON public.tourist USING btree (id_tourist);


--
-- TOC entry 4811 (class 1259 OID 16530)
-- Name: trip_pk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX trip_pk ON public.trip USING btree (id_trip);


--
-- TOC entry 4819 (class 2620 OID 32772)
-- Name: tourist trg_assign_first_trip_discount; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_assign_first_trip_discount BEFORE INSERT ON public.tourist FOR EACH ROW EXECUTE FUNCTION public.assign_first_trip_discount();


--
-- TOC entry 4820 (class 2620 OID 32789)
-- Name: trip trg_prevent_status_update_after_confirmation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_prevent_status_update_after_confirmation BEFORE UPDATE ON public.trip FOR EACH ROW EXECUTE FUNCTION public.prevent_status_update_after_confirmation();


--
-- TOC entry 4812 (class 2606 OID 16535)
-- Name: departure fk_departur_occur_journey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departure
    ADD CONSTRAINT fk_departur_occur_journey FOREIGN KEY (id_journey) REFERENCES public.journey(id_journey) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- TOC entry 4813 (class 2606 OID 16540)
-- Name: journey fk_journey_publishes_administ; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journey
    ADD CONSTRAINT fk_journey_publishes_administ FOREIGN KEY (id_administrator) REFERENCES public.administrator(id_administrator) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- TOC entry 4814 (class 2606 OID 16545)
-- Name: tourist fk_tourist_has_discount; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tourist
    ADD CONSTRAINT fk_tourist_has_discount FOREIGN KEY (id_discount) REFERENCES public.discount(id_discount) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- TOC entry 4815 (class 2606 OID 16550)
-- Name: trip fk_trip_applies_discount; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trip
    ADD CONSTRAINT fk_trip_applies_discount FOREIGN KEY (id_discount) REFERENCES public.discount(id_discount) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- TOC entry 4816 (class 2606 OID 16555)
-- Name: trip fk_trip_confirms_administ; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trip
    ADD CONSTRAINT fk_trip_confirms_administ FOREIGN KEY (id_administrator) REFERENCES public.administrator(id_administrator) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- TOC entry 4817 (class 2606 OID 16560)
-- Name: trip fk_trip_gets_journey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trip
    ADD CONSTRAINT fk_trip_gets_journey FOREIGN KEY (id_journey) REFERENCES public.journey(id_journey) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- TOC entry 4818 (class 2606 OID 16565)
-- Name: trip fk_trip_makes_tourist; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trip
    ADD CONSTRAINT fk_trip_makes_tourist FOREIGN KEY (id_tourist) REFERENCES public.tourist(id_tourist) ON UPDATE RESTRICT ON DELETE RESTRICT;


-- Completed on 2025-06-16 21:58:35

--
-- PostgreSQL database dump complete
--

