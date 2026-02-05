import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormListPage } from './form-list.page';

describe('FormListPage', () => {
  let component: FormListPage;
  let fixture: ComponentFixture<FormListPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(FormListPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
