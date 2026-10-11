import type {Mapping} from "@workspace/calculation";

// Embedded synthetic golden-baseline examples, NOT queried/copied from a tenant.
// Deliberately bundled: production never needs a shell or test-data directory.
const units={kg:"1",kgs:"1",t:"1000",tonne:"1000",lb:"0.45359237",g:"0.001"};
const tolerances={imbalance_warn_pct:"1",imbalance_error_pct:"5"};
export const demoDatasets:{source:string;files:Record<string,string>;mapping:Mapping}[]=[
  {source:"DEMO baseline",files:{
    "orders.csv":"order_id,product_code,line_id,machine_id,mold_id\nE-01,CAP-38-HDPE,LINE-1,INJ-03,MLD-114\nE-02,CAP-38-HDPE,LINE-1,INJ-03,MLD-207\n",
    "production_records.csv":"record_id,order_id,machine_id,mold_id,shift,record_date,material_input,good_output,scrap,unit\nPR-5001,E-01,INJ-03,MLD-114,A,2026-09-01,600,570,30,kg\nPR-5002,E-01,INJ-03,MLD-114,B,2026-09-01,400,380,20,kg\nPR-5003,E-02,INJ-03,MLD-207,A,2026-09-02,400,360,40,kg\nPR-5004,E-02,INJ-03,MLD-207,B,2026-09-02,350,315,35,kg\nPR-5005,E-02,INJ-03,MLD-207,C,2026-09-02,250,225,25,kg\n",
    "events.csv":"event_id,order_id,machine_id,mold_id,shift,event_code,start_time,end_time,duration_min,recorded_reason\nEV-1001,E-01,INJ-03,MLD-114,A,CHG,2026-09-01 06:00,2026-09-01 10:00,240,Mold change to MLD-114\nEV-2001,E-02,INJ-03,MLD-207,A,CHG,2026-09-02 06:00,2026-09-02 12:00,360,Mold change to MLD-207\nEV-2002,E-02,INJ-03,MLD-207,B,UDT,2026-09-02 15:10,2026-09-02 15:55,45,Unplanned stop - feed interruption\n",
  },mapping:{schema_version:1,capability_level:3,source_name:"DEMO baseline",
    format:{encoding:"auto",delimiter:"auto",decimal_separator:".",date_format:"%Y-%m-%d",datetime_format:"%Y-%m-%d %H:%M"},
    files:{
      orders:{file:"orders.csv",columns:{order_id:"order_id",product_code:"product_code",line_id:"line_id",machine_id:"machine_id",mold_id:"mold_id"}},
      records:{file:"production_records.csv",columns:{record_id:"record_id",order_id:"order_id",machine_id:"machine_id",mold_id:"mold_id",shift:"shift",record_date:"record_date",input:"material_input",good:"good_output",scrap:"scrap",unit:"unit"}},
      events:{file:"events.csv",columns:{event_id:"event_id",order_id:"order_id",machine_id:"machine_id",mold_id:"mold_id",shift:"shift",event_code:"event_code",start:"start_time",end:"end_time",duration_min:"duration_min",reason:"recorded_reason"}},
    },event_code_map:{CHG:"CHANGEOVER",UDT:"UNPLANNED_DOWNTIME",PMT:"PLANNED_STOP"},unit_factors_to_kg:units,tolerances}},
  {source:"DEMO decimal-comma",files:{
    "jobs.csv":"JobNo;Product;Press;Die\nE-01;BOTTLE-1L-PET;PRESS-7;DIE-31\nB-102;BOTTLE-1L-PET;PRESS-7;DIE-44\n",
    "output.csv":"RowNo;JobNo;Crew;Date;RawMaterial_t;Good_t;Reject_t\n1;E-01;1;03/09/2026;1,500;1,380;0,120\n2;E-01;2;03/09/2026;1,000;0,920;0,080\n3;B-102;1;04/09/2026;2,000;1,880;0,120\n",
    "stops.csv":"StopId;JobNo;Kind;From;To;Minutes\nS-01;E-01;MOLD;03/09/2026 07:00;03/09/2026 10:00;180\nS-02;B-102;MOLD;04/09/2026 07:00;04/09/2026 09:30;150\nS-03;B-102;BREAKDOWN;04/09/2026 13:00;04/09/2026 13:20;20\n",
  },mapping:{schema_version:1,capability_level:3,source_name:"DEMO decimal-comma",
    format:{encoding:"auto",delimiter:"auto",decimal_separator:",",date_format:"%d/%m/%Y",datetime_format:"%d/%m/%Y %H:%M"},
    files:{
      orders:{file:"jobs.csv",columns:{order_id:"JobNo",product_code:"Product",machine_id:"Press",mold_id:"Die"}},
      records:{file:"output.csv",fixed_unit:"t",columns:{record_id:"RowNo",order_id:"JobNo",shift:"Crew",record_date:"Date",input:"RawMaterial_t",good:"Good_t",scrap:"Reject_t"}},
      events:{file:"stops.csv",columns:{event_id:"StopId",order_id:"JobNo",event_code:"Kind",start:"From",end:"To",duration_min:"Minutes"}},
    },event_code_map:{MOLD:"CHANGEOVER",BREAKDOWN:"UNPLANNED_DOWNTIME"},unit_factors_to_kg:units,tolerances}},
];
