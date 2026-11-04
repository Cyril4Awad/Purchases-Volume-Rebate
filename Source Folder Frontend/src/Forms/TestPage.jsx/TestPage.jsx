import React, { useMemo, useState } from "react";
import { Column, SortIndicator } from "react-virtualized";
import {
    AdvancedTable,
    ButtonsContainer,
    CheckBoxComp,
    DateTimePickerComp,
    InputTextComponent,
    ModalComp,
    RadioGroupComp,
    SelectComp,
    TextAreaComp,
    VirtualTable,
} from "../../ReusableComponents";
import { useStateWithCallback } from "../../CustomHooks/useStateWithCallback";
import { Button } from "reactstrap";
import moment from "moment";

export function TestPage() {
    const selectOptions = useMemo(
        () => [
            { value: "doctor", label: "Doctor" },
            { value: "nurse", label: "Nurse" },
            { value: "admin", label: "Admin" },
        ],
        []
    );

    const [formValues, setFormValues] = useStateWithCallback({
        inputValue: "Dummy text",
        selectedRole: selectOptions[0],
        isActive: true,
        selectedRadio: "Option A",
        notes: "This is a dummy textarea value.",
    });
    const [dateTimeValues, setDateTimeValues] = useState({
        recordDate: null,
        timeOut: null,
        dischargeDate: null,
        missingrecordDate: false,
        missingtimeOut: false,
        locked: false,
    });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const isViewOnly = false;

    const dummyRows = useMemo(
        () => [
            { id: 1, name: "John Carter", role: "Doctor", age: 41, city: "Cairo" },
            { id: 2, name: "Lana Aziz", role: "Nurse", age: 29, city: "Giza" },
            { id: 3, name: "Omar Samir", role: "Admin", age: 35, city: "Alexandria" },
            { id: 4, name: "Mona Adel", role: "Doctor", age: 45, city: "Mansoura" },
        ],
        []
    );

    const advancedColumns = useMemo(
        () => [
            { Header: "ID", accessor: "id", width: 70 },
            { Header: "Name", accessor: "name" },
            { Header: "Role", accessor: "role" },
            { Header: "Age", accessor: "age", width: 80 },
            { Header: "City", accessor: "city" },
        ],
        []
    );

    const handleInputChange = (value, name) => {
        setFormValues((prev) => ({ ...prev, [name]: value }));
    };

    const handleSelectChange = (value, name) => {
        setFormValues((prev) => ({ ...prev, [name]: value }));
    };

    const handleCheckboxChange = (checked, name) => {
        setFormValues((prev) => ({ ...prev, [name]: checked }));
    };

    const handleRadioChange = (value) => {
        setFormValues((prev) => ({ ...prev, selectedRadio: value }));
    };

    const handleTextareaChange = (value, name) => {
        setFormValues((prev) => ({ ...prev, [name]: value }));
    };

    const handleButtonClick = (buttonName) => {
        // Test handler for the reusable button container actions.
        console.log("ButtonsContainer action:", buttonName);
    };
    const handleDateTimeChange = (value, name) => {
        setDateTimeValues((prev) => ({
            ...prev,
            [name]: value || null,
            ...(name === "recordDate" ? { missingrecordDate: !value } : {}),
            ...(name === "timeOut" ? { missingtimeOut: !value } : {}),
        }));
    };

    const virtualizedColumns = useMemo(() => {
        return [
            <Column
                key="id"
                width={100}
                minWidth={100}
                dataKey="id"
                headerRenderer={(props) => (
                    <>
                        ID
                        <SortIndicator sortDirection={props.sortDirection} />
                    </>
                )}
                cellRenderer={({ rowData }) => <div className="text-wrap">{rowData.id}</div>}
            />,
            <Column
                key="name"
                width={250}
                minWidth={200}
                dataKey="name"
                headerRenderer={(props) => (
                    <>
                        Name
                        <SortIndicator sortDirection={props.sortDirection} />
                    </>
                )}
                cellRenderer={({ rowData }) => <div className="text-wrap">{rowData.name}</div>}
            />,
            <Column
                key="role"
                width={180}
                minWidth={150}
                dataKey="role"
                headerRenderer={(props) => (
                    <>
                        Role
                        <SortIndicator sortDirection={props.sortDirection} />
                    </>
                )}
                cellRenderer={({ rowData }) => <div className="text-wrap">{rowData.role}</div>}
            />,
            <Column
                key="age"
                width={100}
                minWidth={90}
                dataKey="age"
                headerRenderer={(props) => (
                    <>
                        Age
                        <SortIndicator sortDirection={props.sortDirection} />
                    </>
                )}
                cellRenderer={({ rowData }) => <div className="text-wrap">{rowData.age}</div>}
            />,
            <Column
                key="city"
                width={220}
                minWidth={180}
                dataKey="city"
                headerRenderer={(props) => (
                    <>
                        City
                        <SortIndicator sortDirection={props.sortDirection} />
                    </>
                )}
                cellRenderer={({ rowData }) => <div className="text-wrap">{rowData.city}</div>}
            />,
        ];
    }, []);

    const columnsToFilter = useMemo(() => {
        const arr = virtualizedColumns.map(e => {
            return {
                isSelected: e.props.dataKey !== 'checked', columnName: e.props.dataKey
            }
        })
        arr.push(
            { isSelected: true, columnName: 'city' },
        )
        return arr
    }, [virtualizedColumns])

    return (
        <div
            style={{
                padding: 20,
                height: "calc(100vh - 100px)",
                overflowY: "auto",
                background: "#f7f9fc",
            }}
        >
            <h3 style={{ marginBottom: 16 }}>Reusable Components Test Page</h3>

            <div
                style={{
                    marginBottom: 16,
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 12,
                }}
            >
                <ButtonsContainer
                    handleButtonClick={handleButtonClick}
                    showSave
                    showPrint
                    showDelete
                    showClose
                    createdBy="Test User"
                    creationDate={new Date().toISOString()}
                    modifiedBy="Test User"
                    modifiedDate={new Date().toISOString()}
                />
            </div>

            <div
                style={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 24,
                }}
            >
                <h5 style={{ marginBottom: 12 }}>Form Components</h5>
                <div
                    style={{
                        display: "grid",
                        gap: 16,
                        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    }}
                >
                    {/* date */}
                    <DateTimePickerComp
                        name="recordDate"
                        value={dateTimeValues.recordDate}
                        selected={dateTimeValues.recordDate}
                        onDateTimeChange={handleDateTimeChange}
                        placeholder={<>Date  <span className='required'>*</span></>}
                        invalid={dateTimeValues.missingrecordDate}
                        clearable
                        disabled={isViewOnly}
                        maxDate={moment()}
                    />

                    {/* time */}
                    <DateTimePickerComp
                        name="timeOut"
                        value={dateTimeValues.timeOut}
                        selected={dateTimeValues.timeOut}
                        onDateTimeChange={handleDateTimeChange}
                        placeholder={<>Time  <span className='required'>*</span></>}
                        showTimeSelectOnly
                        dateFormat="hh:mm aa"
                        timeFormat="hh:mm aa"
                        dateTimeMask="hr:mn ap"
                        invalid={dateTimeValues.missingtimeOut}
                        clearable
                        disabled={isViewOnly}
                        showTimeSelect
                    />

                    {/* date/time */}
                    <DateTimePickerComp
                        selected={dateTimeValues.dischargeDate}
                        value={dateTimeValues.dischargeDate}
                        name="dischargeDate"
                        placeholder="Date & Time"
                        onDateTimeChange={handleDateTimeChange}
                        dateFormat="dd/MM/yyyy hh:mm aa"
                        timeFormat="hh:mm aa"
                        dateTimeMask="99/99/9999 99:99 ap"
                        dateSlash
                        showTime
                        showTimeSelect
                        disabled={dateTimeValues.locked}
                        clearable
                    />

                    <SelectComp
                        name="selectedRole"
                        value={formValues.selectedRole}
                        options={selectOptions}
                        onChange={handleSelectChange}
                        placeholder="Select Role"
                        clearable
                        className=""
                    />
                    <SelectComp
                        name="selectedRoles"
                        value={formValues.selectedRoles}
                        options={selectOptions}
                        onChange={handleSelectChange}
                        placeholder="Select Roles"
                        clearable
                        className=""
                        multi
                    />

                    <InputTextComponent
                        name="inputValue"
                        value={formValues.inputValue}
                        handleChange={handleInputChange}
                        placeholder="Input Text Component"
                        className="form-control"
                    />

                    <CheckBoxComp
                        name="isActive"
                        checked={formValues.isActive}
                        onCheckChange={handleCheckboxChange}
                        description="Active User"
                    />

                    <div style={{ gridColumn: "1 / -1" }}>
                        <RadioGroupComp
                            name="testRadioGroup"
                            value={formValues.selectedRadio}
                            onClick={handleRadioChange}
                            className=""
                            radios={[
                                { value: "Option A", name: "Option A" },
                                { value: "Option B", name: "Option B" },
                                { value: "Option C", name: "Option C" },
                            ]}
                        />
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                        <TextAreaComp
                            name="notes"
                            value={formValues.notes}
                            onChange={handleTextareaChange}
                            placeholder="Textarea Component"
                            className=""
                            maxRows={5}
                        />
                    </div>

                    <div>
                        <Button color="primary" onClick={() => setIsModalOpen(true)}>
                            Dummy Button
                        </Button>
                    </div>
                </div>
            </div>

            <div
                style={{
                    marginTop: 24,
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 16,
                }}
            >
                <h5>AdvancedTable</h5>
                <AdvancedTable columns={advancedColumns} dataArray={dummyRows} minRows={3} />
            </div>

            <div
                style={{
                    marginTop: 24,
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 16,
                }}
            >
                <h5>VirtualTable</h5>
                <div style={{ overflowX: "auto" }}>
                    <VirtualTable
                        id="test-virtual-table"
                        gridClassName="test-virtual-grid"
                        classname="test-virtual-table"
                        data={dummyRows}
                        width={900}
                        height={280}
                        headerHeight={40}
                        rowHeight={40}
                        rowClassName="virtual-row"
                        enableSearch
                        columns={virtualizedColumns}
                        columsToBeFiltered={columnsToFilter}
                    />
                </div>
            </div>

            <ModalComp
                modal={isModalOpen}
                modalTitle="Test Modal"
                modalBody={
                    <div>
                        This is a dummy modal from `ModalComp` for testing.
                    </div>
                }
                onClose={() => setIsModalOpen(false)}
                onCloseText="Close"
                hideFooterButtons={false}
                onAccept={() => setIsModalOpen(false)}
                onAcceptText="OK"
                onAcceptColor="primary"
            />
        </div>
    );
}